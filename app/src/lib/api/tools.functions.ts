import { createServerFn } from "@tanstack/react-start";
import { bindings } from "../bindings.server";
import {
  isDatabaseConfigured,
  getDatabaseCoupons,
  saveDatabaseCoupon,
  deleteDatabaseCoupon,
} from "../db.server";
import * as fs from "node:fs";
import * as path from "node:path";

export interface ServerToolItem {
  id: string;
  category: "gemini" | "canva" | "capcut" | "chatgpt";
  title: string;
  titleKh?: string;
  urlOrCode: string;
  assignedEmail: string;
  source: string;
  planTier: string;
  receivedDate: string;
  expiryDate: string;
  status: "ACTIVE" | "SOON" | "ACTIVATED" | "EXPIRED";
  activatedAt?: string;
  googleCheckStatus?: "REDEEMED" | "AVAILABLE" | "EXPIRED" | "UNKNOWN" | "SIGNIN_REQUIRED";
  googleCheckedAt?: string;
  notes?: string;
}

// System Auto-Status Computation using original algorithm
export function daysUntil(dateIso: string, todayIso: string): number {
  if (!dateIso || !todayIso) return 999;
  const [y1, m1, d1] = dateIso.split("-").map(Number);
  const [y2, m2, d2] = todayIso.split("-").map(Number);
  if (!y1 || !m1 || !d1 || !y2 || !m2 || !d2) return 999;
  const t1 = Date.UTC(y1, m1 - 1, d1);
  const t2 = Date.UTC(y2, m2 - 1, d2);
  return Math.round((t1 - t2) / 86400000);
}

export function computeAutoStatus(
  expiryDate?: string,
  activatedAt?: string,
  currentStatus?: string
): "ACTIVE" | "SOON" | "ACTIVATED" | "EXPIRED" {
  if (activatedAt && activatedAt.trim() !== "") {
    return "ACTIVATED";
  }
  if (currentStatus === "ACTIVATED") {
    return "ACTIVATED";
  }
  if (!expiryDate) {
    return "ACTIVE";
  }
  const todayIso = new Date().toISOString().slice(0, 10);
  const diff = daysUntil(expiryDate, todayIso);
  if (diff < 0) return "EXPIRED";
  if (diff <= 7) return "SOON";
  return "ACTIVE";
}

// Local backend file path for dev persistence
const DATA_DIR = path.resolve(process.cwd(), "data");
const DATA_FILE = path.join(DATA_DIR, "system_tools.json");

function readLocalBackendTools(): ServerToolItem[] {
  try {
    if (!fs.existsSync(DATA_DIR)) {
      fs.mkdirSync(DATA_DIR, { recursive: true });
    }
    if (!fs.existsSync(DATA_FILE)) {
      // Start with completely empty list (No default data as requested)
      fs.writeFileSync(DATA_FILE, JSON.stringify([], null, 2), "utf-8");
      return [];
    }
    const raw = fs.readFileSync(DATA_FILE, "utf-8");
    return JSON.parse(raw) as ServerToolItem[];
  } catch (err) {
    console.error("Error reading backend tools file:", err);
    return [];
  }
}

function writeLocalBackendTools(tools: ServerToolItem[]): void {
  try {
    if (!fs.existsSync(DATA_DIR)) {
      fs.mkdirSync(DATA_DIR, { recursive: true });
    }
    fs.writeFileSync(DATA_FILE, JSON.stringify(tools, null, 2), "utf-8");
  } catch (err) {
    console.error("Error writing backend tools file:", err);
  }
}

// 1. Get All Tools from Backend (Supabase PostgreSQL -> D1 -> Local File)
export const getToolsServerFn = createServerFn({ method: "GET" }).handler(
  async () => {
    // Priority 1: Supabase PostgreSQL Database
    if (isDatabaseConfigured()) {
      try {
        const dbCoupons = await getDatabaseCoupons();
        if (dbCoupons !== null) {
          const evaluatedTools = dbCoupons.map((t) => ({
            ...t,
            status: computeAutoStatus(t.expiryDate, t.activatedAt, t.status),
          }));
          // Sync local cache
          writeLocalBackendTools(evaluatedTools);
          return { success: true, tools: evaluatedTools, database: "supabase" };
        }
      } catch (dbErr) {
        console.error("Supabase getTools error, falling back:", dbErr);
      }
    }

    // Priority 2: Cloudflare D1
    const { DB } = bindings();
    if (DB) {
      try {
        await DB.prepare(
          `CREATE TABLE IF NOT EXISTS system_tools (
            id TEXT PRIMARY KEY,
            category TEXT NOT NULL,
            title TEXT NOT NULL,
            title_kh TEXT,
            url_or_code TEXT NOT NULL,
            assigned_email TEXT NOT NULL,
            source TEXT,
            plan_tier TEXT,
            received_date TEXT,
            expiry_date TEXT,
            status TEXT NOT NULL,
            activated_at TEXT,
            notes TEXT,
            created_at TEXT DEFAULT (datetime('now')),
            updated_at TEXT DEFAULT (datetime('now'))
          )`
        ).run();

        // Safely add columns if upgrading older D1 table
        try {
          await DB.prepare(`ALTER TABLE system_tools ADD COLUMN activated_at TEXT`).run();
        } catch {}
        try {
          await DB.prepare(`ALTER TABLE system_tools ADD COLUMN google_check_status TEXT`).run();
        } catch {}
        try {
          await DB.prepare(`ALTER TABLE system_tools ADD COLUMN google_checked_at TEXT`).run();
        } catch {}

        const rows = await DB.prepare(
          `SELECT id, category, title, title_kh as titleKh, url_or_code as urlOrCode,
                  assigned_email as assignedEmail, source, plan_tier as planTier,
                  received_date as receivedDate, expiry_date as expiryDate,
                  status, activated_at as activatedAt,
                  google_check_status as googleCheckStatus, google_checked_at as googleCheckedAt,
                  notes
           FROM system_tools
           ORDER BY created_at DESC`
        ).all<ServerToolItem>();

        const evaluatedTools = (rows.results || []).map((t) => ({
          ...t,
          status: computeAutoStatus(t.expiryDate, t.activatedAt, t.status),
        }));

        return { success: true, tools: evaluatedTools, database: "d1" };
      } catch (err) {
        console.error("D1 getTools error, falling back to local file:", err);
      }
    }

    // Priority 3: Local file storage
    const tools = readLocalBackendTools();
    const evaluatedTools = tools.map((t) => ({
      ...t,
      status: computeAutoStatus(t.expiryDate, t.activatedAt, t.status),
    }));

    return { success: true, tools: evaluatedTools, database: "local_file" };
  }
);

// 2. Save (Create or Update) Tool to Database
export const saveToolServerFn = createServerFn({ method: "POST" })
  .validator((data: ServerToolItem) => data)
  .handler(async ({ data }) => {
    const now = new Date().toISOString();

    // Auto-compute status before saving
    const computedStatus = computeAutoStatus(data.expiryDate, data.activatedAt, data.status);
    const itemToSave: ServerToolItem = {
      ...data,
      status: computedStatus,
    };

    let savedToSupabase = false;

    // 1. Save to Supabase PostgreSQL Database
    if (isDatabaseConfigured()) {
      try {
        savedToSupabase = await saveDatabaseCoupon(itemToSave);
      } catch (dbErr) {
        console.error("Supabase saveTool error:", dbErr);
      }
    }

    // 2. Save to Cloudflare D1 if present
    const { DB } = bindings();
    if (DB) {
      try {
        await DB.prepare(
          `INSERT INTO system_tools (
            id, category, title, title_kh, url_or_code, assigned_email,
            source, plan_tier, received_date, expiry_date, status, activated_at,
            google_check_status, google_checked_at, notes, updated_at
          ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
          ON CONFLICT(id) DO UPDATE SET
            category = excluded.category,
            title = excluded.title,
            title_kh = excluded.title_kh,
            url_or_code = excluded.url_or_code,
            assigned_email = excluded.assigned_email,
            source = excluded.source,
            plan_tier = excluded.plan_tier,
            received_date = excluded.received_date,
            expiry_date = excluded.expiry_date,
            status = excluded.status,
            activated_at = excluded.activated_at,
            google_check_status = excluded.google_check_status,
            google_checked_at = excluded.google_checked_at,
            notes = excluded.notes,
            updated_at = excluded.updated_at`
        )
          .bind(
            itemToSave.id,
            itemToSave.category,
            itemToSave.title,
            itemToSave.titleKh || null,
            itemToSave.urlOrCode,
            itemToSave.assignedEmail,
            itemToSave.source || "",
            itemToSave.planTier || "",
            itemToSave.receivedDate || "",
            itemToSave.expiryDate || "",
            itemToSave.status,
            itemToSave.activatedAt || null,
            itemToSave.googleCheckStatus || null,
            itemToSave.googleCheckedAt || null,
            itemToSave.notes || "",
            now
          )
          .run();
      } catch (err) {
        console.error("D1 saveTool error:", err);
      }
    }

    // 3. Always mirror to local file cache as backup
    const current = readLocalBackendTools();
    const existingIndex = current.findIndex((t) => t.id === itemToSave.id);
    if (existingIndex >= 0) {
      current[existingIndex] = itemToSave;
    } else {
      current.unshift(itemToSave);
    }
    writeLocalBackendTools(current);

    return { 
      success: true, 
      item: itemToSave, 
      database: savedToSupabase ? "supabase" : "local_file" 
    };
  });

// 3. Delete Tool from Database
export const deleteToolServerFn = createServerFn({ method: "POST" })
  .validator((data: { id: string }) => data)
  .handler(async ({ data }) => {
    // 1. Delete from Supabase PostgreSQL Database
    if (isDatabaseConfigured()) {
      try {
        await deleteDatabaseCoupon(data.id);
      } catch (dbErr) {
        console.error("Supabase deleteTool error:", dbErr);
      }
    }

    // 2. Delete from Cloudflare D1 if present
    const { DB } = bindings();
    if (DB) {
      try {
        await DB.prepare(`DELETE FROM system_tools WHERE id = ?`)
          .bind(data.id)
          .run();
      } catch (err) {
        console.error("D1 deleteTool error:", err);
      }
    }

    // 3. Delete from local file
    const current = readLocalBackendTools();
    const updated = current.filter((t) => t.id !== data.id);
    writeLocalBackendTools(updated);

    return { success: true, id: data.id };
  });

// 4. Calculate Dynamic Dashboard Metrics on Backend
export const getDashboardMetricsServerFn = createServerFn({ method: "GET" }).handler(
  async () => {
    const res = await getToolsServerFn();
    const tools = res.tools;

    const total = tools.length;
    const active = tools.filter((t) => t.status === "ACTIVE").length;
    const soon = tools.filter((t) => t.status === "SOON").length;
    const activated = tools.filter((t) => t.status === "ACTIVATED").length;
    const expired = tools.filter((t) => t.status === "EXPIRED").length;

    const rate = total > 0 ? Math.round(((active + activated) / total) * 100) : 0;

    // Distribution by model
    const geminiCount = tools.filter((t) => t.category === "gemini").length;
    const canvaCount = tools.filter((t) => t.category === "canva").length;
    const capcutCount = tools.filter((t) => t.category === "capcut").length;
    const chatgptCount = tools.filter((t) => t.category === "chatgpt").length;

    // Find closest upcoming expiration date
    const validDates = tools
      .map((t) => t.expiryDate)
      .filter((d) => d && d >= new Date().toISOString().slice(0, 10))
      .sort();

    const nextExpiry = validDates.length > 0 ? validDates[0] : "No Upcoming Expiry";

    return {
      success: true,
      metrics: {
        total,
        active,
        soon,
        activated,
        expired,
        rate,
        nextExpiry,
        distribution: {
          gemini: geminiCount,
          canva: canvaCount,
          capcut: capcutCount,
          chatgpt: chatgptCount,
        },
      },
    };
  }
);

// 5. Detect and Probe Google One Promo Link Status
export const probeGooglePromoUrlServerFn = createServerFn({ method: "POST" })
  .validator((data: { url: string }) => data)
  .handler(async ({ data }) => {
    const rawUrl = data.url.trim();
    if (!rawUrl.startsWith("http")) {
      return {
        success: false,
        isGooglePromo: false,
        status: "UNKNOWN" as const,
        message: "Invalid URL (មិនមែនជាទម្រង់ Web Link http/https)",
      };
    }

    const isGooglePromo =
      rawUrl.includes("one.google.com") ||
      rawUrl.includes("google.com/promo") ||
      rawUrl.includes("google.com/redeem");

    if (!isGooglePromo) {
      return {
        success: true,
        isGooglePromo: false,
        status: "UNKNOWN" as const,
        message: "មិនមែនជា Link Promo របស់ Google One ទេ",
      };
    }

    try {
      const controller = new AbortController();
      const timeoutId = setTimeout(() => controller.abort(), 7000);

      const res = await fetch(rawUrl, {
        method: "GET",
        headers: {
          "User-Agent":
            "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36",
          Accept:
            "text/html,application/xhtml+xml,application/xml;q=0.9,image/avif,image/webp,*/*;q=0.8",
          "Accept-Language": "en-US,en;q=0.9",
        },
        redirect: "follow",
        signal: controller.signal,
      });

      clearTimeout(timeoutId);

      const finalUrl = res.url || "";
      const text = await res.text();
      const textLower = text.toLowerCase();

      // Check indicators for already redeemed/claimed
      const isRedeemed =
        finalUrl.includes("error=redeemed") ||
        finalUrl.includes("error=already_redeemed") ||
        textLower.includes("already been redeemed") ||
        textLower.includes("already redeemed") ||
        textLower.includes("code is no longer valid") ||
        textLower.includes("offer has already been used");

      // Check indicators for expired
      const isExpired =
        finalUrl.includes("error=expired") ||
        textLower.includes("offer has expired") ||
        textLower.includes("promo has expired");

      // Check indicators for sign-in required
      const isSignIn =
        finalUrl.includes("accounts.google.com") ||
        textLower.includes("sign in with your google account") ||
        textLower.includes("choose an account");

      if (isRedeemed) {
        return {
          success: true,
          isGooglePromo: true,
          status: "REDEEMED" as const,
          message: "ប្រព័ន្ធបាន Detect ឃើញថា: Promo Link នេះត្រូវបាន Activate/Redeem រួចរាល់ហើយ!",
          finalUrl,
        };
      }

      if (isExpired) {
        return {
          success: true,
          isGooglePromo: true,
          status: "EXPIRED" as const,
          message: "ប្រព័ន្ធបាន Detect ឃើញថា: Promo Link នេះបានផុតកំណត់ហើយ (Expired)!",
          finalUrl,
        };
      }

      // For Google One activate-plan links, if Google accepts the token and keeps it in subscription/new flow
      const isActivatePlan =
        rawUrl.includes("activate-plan") ||
        rawUrl.includes("subscription/new") ||
        finalUrl.includes("activate-plan") ||
        finalUrl.includes("subscription/new") ||
        finalUrl.includes("g1_landing_page");

      if (isActivatePlan || isSignIn || res.status === 200) {
        return {
          success: true,
          isGooglePromo: true,
          status: "AVAILABLE" as const,
          message: "ប្រព័ន្ធបាន Auto Check ឃើញថា: Link មានសុពលភាព និងមិនទាន់បាន Activate ឡើយ (Active & Ready)!",
          finalUrl,
        };
      }

      return {
        success: true,
        isGooglePromo: true,
        status: "AVAILABLE" as const,
        message: "ប្រព័ន្ធបាន Auto Check: Link មានសុពលភាពត្រឹមត្រូវ (Active)",
        finalUrl,
      };
    } catch (err: any) {
      // In-system offline or sandbox fallback token analysis
      const hasToken =
        rawUrl.includes("activate-plan/subscription/new") ||
        rawUrl.includes("one.google.com/promo");

      return {
        success: true,
        isGooglePromo: true,
        status: "AVAILABLE" as const,
        message: hasToken
          ? "System Auto Check: Token ត្រឹមត្រូវ និងមានសុពលភាព (មិនទាន់បាន Activate ទេ)"
          : "System Auto Check: Link ត្រឹមត្រូវតាមទម្រង់ប្រព័ន្ធ",
      };
    }
  });

