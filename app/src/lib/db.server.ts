import postgres from "postgres";
import type { ServerToolItem } from "./api/tools.functions";

let sqlInstance: ReturnType<typeof postgres> | null = null;

export function getPostgresClient() {
  const dbUrl = process.env.DATABASE_URL;
  if (!dbUrl) {
    return null;
  }

  if (!sqlInstance) {
    // prepare: false is required for Supabase transaction pooler (port 6543 / pgbouncer)
    sqlInstance = postgres(dbUrl, {
      prepare: false,
      max: 10,
      idle_timeout: 20,
      connect_timeout: 10,
    });
  }

  return sqlInstance;
}

export function isDatabaseConfigured(): boolean {
  return Boolean(process.env.DATABASE_URL);
}

/**
 * Fetch all coupons from Supabase PostgreSQL
 */
export async function getDatabaseCoupons(): Promise<ServerToolItem[] | null> {
  const sql = getPostgresClient();
  if (!sql) return null;

  try {
    const rows = await sql<any[]>`
      SELECT 
        id,
        category,
        title,
        COALESCE(title_kh, '') as "titleKh",
        COALESCE(url_or_code, url, '') as "urlOrCode",
        COALESCE(assigned_email, '') as "assignedEmail",
        COALESCE(source, '') as source,
        COALESCE(plan_tier, '') as "planTier",
        COALESCE(received_at, '') as "receivedDate",
        COALESCE(expires_at, '') as "expiryDate",
        COALESCE(status, 'ACTIVE') as status,
        COALESCE(activated_at, '') as "activatedAt",
        COALESCE(google_check_status, '') as "googleCheckStatus",
        COALESCE(google_checked_at, '') as "googleCheckedAt",
        COALESCE(notes, '') as notes
      FROM coupons
      ORDER BY created_at DESC
    `;

    return rows.map((r) => ({
      id: r.id,
      category: r.category || "gemini",
      title: r.title || "",
      titleKh: r.titleKh || undefined,
      urlOrCode: r.urlOrCode || "",
      assignedEmail: r.assignedEmail || "",
      source: r.source || "",
      planTier: r.planTier || "",
      receivedDate: r.receivedDate || "",
      expiryDate: r.expiryDate || "",
      status: r.status as ServerToolItem["status"],
      activatedAt: r.activatedAt || undefined,
      googleCheckStatus: r.googleCheckStatus || undefined,
      googleCheckedAt: r.googleCheckedAt || undefined,
      notes: r.notes || "",
    }));
  } catch (err) {
    console.error("Supabase PostgreSQL fetch error:", err);
    return null;
  }
}

/**
 * Insert or update a coupon in Supabase PostgreSQL
 */
export async function saveDatabaseCoupon(item: ServerToolItem): Promise<boolean> {
  const sql = getPostgresClient();
  if (!sql) return false;

  try {
    const url = item.urlOrCode || "";
    const receivedAt = item.receivedDate || "";
    const expiresAt = item.expiryDate || "";

    await sql`
      INSERT INTO coupons (
        id, category, title, title_kh, url, url_or_code, assigned_email,
        source, plan_tier, received_at, expires_at, status, activated_at,
        google_check_status, google_checked_at, notes, updated_at
      ) VALUES (
        ${item.id}, ${item.category}, ${item.title}, ${item.titleKh || ""},
        ${url}, ${url}, ${item.assignedEmail || ""},
        ${item.source || ""}, ${item.planTier || ""}, ${receivedAt},
        ${expiresAt}, ${item.status || "ACTIVE"}, ${item.activatedAt || ""},
        ${item.googleCheckStatus || ""}, ${item.googleCheckedAt || ""}, ${item.notes || ""},
        NOW()
      )
      ON CONFLICT (id) DO UPDATE SET
        category = EXCLUDED.category,
        title = EXCLUDED.title,
        title_kh = EXCLUDED.title_kh,
        url = EXCLUDED.url,
        url_or_code = EXCLUDED.url_or_code,
        assigned_email = EXCLUDED.assigned_email,
        source = EXCLUDED.source,
        plan_tier = EXCLUDED.plan_tier,
        received_at = EXCLUDED.received_at,
        expires_at = EXCLUDED.expires_at,
        status = EXCLUDED.status,
        activated_at = EXCLUDED.activated_at,
        google_check_status = EXCLUDED.google_check_status,
        google_checked_at = EXCLUDED.google_checked_at,
        notes = EXCLUDED.notes,
        updated_at = NOW()
    `;
    return true;
  } catch (err) {
    console.error("Supabase PostgreSQL save error:", err);
    return false;
  }
}

/**
 * Delete a coupon from Supabase PostgreSQL
 */
export async function deleteDatabaseCoupon(id: string): Promise<boolean> {
  const sql = getPostgresClient();
  if (!sql) return false;

  try {
    await sql`
      DELETE FROM coupons WHERE id = ${id}
    `;
    return true;
  } catch (err) {
    console.error("Supabase PostgreSQL delete error:", err);
    return false;
  }
}
