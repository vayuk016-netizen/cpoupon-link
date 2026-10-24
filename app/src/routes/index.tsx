import { createFileRoute } from "@tanstack/react-router";
import { useEffect, useMemo, useRef, useState, type FormEvent, type ChangeEvent, type ReactNode } from "react";

export const Route = createFileRoute("/")({ component: CouponVault });

type CouponRecord = {
  id: string;
  title: string;
  url: string;
  category: string;
  source: string;
  receivedAt: string;
  expiresAt: string;
  notes: string;
  activatedAt: string;
  createdAt: string;
  updatedAt: string;
};

type CouponForm = Omit<CouponRecord, "id" | "activatedAt" | "createdAt" | "updatedAt">;
type Status = "active" | "soon" | "expired" | "activated" | "undated";
const DB_NAME = "coupon-link-vault";
const STORE_NAME = "coupons";
const CATEGORY_PRESETS = ["Gemini Pro", "Canva Pro", "ChatGPT Plus", "Other"] as const;

const EMPTY_FORM: CouponForm = {
  title: "Gemini Pro · 18 months",
  category: "Gemini Pro",
  url: "",
  source: "",
  receivedAt: "",
  expiresAt: "",
  notes: "",
};

function openDatabase(): Promise<IDBDatabase> {
  return new Promise((resolve, reject) => {
    const request = indexedDB.open(DB_NAME, 1);
    request.onupgradeneeded = () => {
      const db = request.result;
      if (!db.objectStoreNames.contains(STORE_NAME)) db.createObjectStore(STORE_NAME, { keyPath: "id" });
    };
    request.onsuccess = () => resolve(request.result);
    request.onerror = () => reject(request.error ?? new Error("Could not open local storage."));
  });
}

function readAll(db: IDBDatabase): Promise<CouponRecord[]> {
  return new Promise((resolve, reject) => {
    const request = db.transaction(STORE_NAME, "readonly").objectStore(STORE_NAME).getAll();
    request.onsuccess = () => {
      const list = (request.result as CouponRecord[]).map((r) => ({
        ...r,
        category: r.category || (r.title?.toLowerCase().includes("canva") ? "Canva Pro" : "Gemini Pro"),
      }));
      resolve(list.sort((a, b) => (a.expiresAt || "9999-12-31").localeCompare(b.expiresAt || "9999-12-31")));
    };
    request.onerror = () => reject(request.error ?? new Error("Could not read local records."));
  });
}

function saveRecord(db: IDBDatabase, record: CouponRecord): Promise<void> {
  return new Promise((resolve, reject) => {
    const request = db.transaction(STORE_NAME, "readwrite").objectStore(STORE_NAME).put(record);
    request.onsuccess = () => resolve();
    request.onerror = () => reject(request.error ?? new Error("Could not save the record."));
  });
}

function deleteRecord(db: IDBDatabase, id: string): Promise<void> {
  return new Promise((resolve, reject) => {
    const request = db.transaction(STORE_NAME, "readwrite").objectStore(STORE_NAME).delete(id);
    request.onsuccess = () => resolve();
    request.onerror = () => reject(request.error ?? new Error("Could not delete the record."));
  });
}

function localDateKey(date = new Date()): string {
  return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, "0")}-${String(date.getDate()).padStart(2, "0")}`;
}

function daysUntil(date: string, today: string): number {
  return Math.round((Date.parse(`${date}T00:00:00Z`) - Date.parse(`${today}T00:00:00Z`)) / 86400000);
}

function statusOf(record: CouponRecord, today: string): Status {
  if (record.activatedAt) return "activated";
  if (!record.expiresAt || !today) return "undated";
  const days = daysUntil(record.expiresAt, today);
  if (days < 0) return "expired";
  if (days <= 7) return "soon";
  return "active";
}

const STATUS_LABEL: Record<Status, string> = {
  active: "Active",
  soon: "Expiring soon",
  expired: "Expired",
  activated: "Activated",
  undated: "No expiry date",
};

function formatDate(date: string): string {
  if (!date) return "Not set";
  const parsed = new Date(`${date}T12:00:00`);
  return Number.isNaN(parsed.getTime()) ? date : parsed.toLocaleDateString(undefined, { day: "numeric", month: "short", year: "numeric" });
}

function validHttpUrl(value: string): boolean {
  try {
    const url = new URL(value);
    return url.protocol === "https:" || url.protocol === "http:";
  } catch {
    return false;
  }
}

function Icon({ name, size = 18 }: { name: string; size?: number }) {
  const common = {
    width: size,
    height: size,
    viewBox: "0 0 24 24",
    fill: "none",
    stroke: "currentColor",
    strokeWidth: 1.8,
    strokeLinecap: "round" as const,
    strokeLinejoin: "round" as const,
    "aria-hidden": true as const,
  };
  const paths: Record<string, ReactNode> = {
    archive: <><rect x="3.5" y="4" width="17" height="4" rx="1"/><path d="M5 8v11.5h14V8M9 12h6"/></>,
    plus: <><path d="M12 5v14M5 12h14"/></>,
    search: <><circle cx="10.8" cy="10.8" r="6.3"/><path d="m16 16 4.5 4.5"/></>,
    copy: <><rect x="8" y="8" width="11" height="12" rx="2"/><path d="M15 8V5a1.5 1.5 0 0 0-1.5-1.5h-7A1.5 1.5 0 0 0 5 5v10a1.5 1.5 0 0 0 1.5 1.5H8"/></>,
    external: <><path d="M13 5h6v6M19 5l-9 9"/><path d="M18 13v5a1 1 0 0 1-1 1H6a1 1 0 0 1-1-1V7a1 1 0 0 1 1-1h5"/></>,
    check: <><path d="m5 12 4 4L19 6"/></>,
    trash: <><path d="M4 7h16M10 11v6M14 11v6M6 7l1 13h10l1-13M9 7V4h6v3"/></>,
    download: <><path d="M12 3v12m-5-5 5 5 5-5"/><path d="M5 17v3h14v-3"/></>,
    upload: <><path d="M12 15V3m-5 5 5-5 5 5"/><path d="M5 17v3h14v-3"/></>,
    calendar: <><rect x="3.5" y="5" width="17" height="15" rx="2"/><path d="M7.5 3.5v3M16.5 3.5v3M3.5 9h17"/></>,
    shield: <><path d="M12 3 19 6v5c0 4.5-3 7.5-7 10-4-2.5-7-5.5-7-10V6l7-3Z"/><path d="m9 12 2 2 4-4"/></>,
    close: <><path d="m6 6 12 12M18 6 6 18"/></>,
    arrow: <><path d="M5 12h14M13 6l6 6-6 6"/></>,
    clock: <><circle cx="12" cy="12" r="8.5"/><path d="M12 7v5l3 2"/></>,
    menu: <><path d="M4 6h16M4 12h16M4 18h16"/></>,
    panelLeft: <><rect x="3" y="3" width="18" height="18" rx="2"/><path d="M9 3v18"/></>,
    sparkles: <><path d="m12 3 1.9 5.7a1 1 0 0 0 .64.64L20.2 11.2l-5.66 1.86a1 1 0 0 0-.64.64L12 19.4l-1.9-5.7a1 1 0 0 0-.64-.64L3.8 11.2l5.66-1.86a1 1 0 0 0 .64-.64L12 3Z"/></>,
    palette: <><circle cx="13.5" cy="6.5" r=".5" fill="currentColor"/><circle cx="17.5" cy="10.5" r=".5" fill="currentColor"/><circle cx="8.5" cy="7.5" r=".5" fill="currentColor"/><circle cx="6.5" cy="12.5" r=".5" fill="currentColor"/><path d="M12 2C6.5 2 2 6.5 2 12s4.5 10 10 10c.93 0 1.5-.68 1.5-1.5 0-.38-.15-.74-.42-1.02-.27-.27-.43-.63-.43-1.02 0-.83.67-1.5 1.5-1.5H16c3.31 0 6-2.69 6-6 0-4.96-4.49-9-10-9Z"/></>,
    tag: <><path d="M12 2H2v10l9.29 9.29c.94.94 2.48.94 3.42 0l6.58-6.58c.94-.94.94-2.48 0-3.42L12 2Z"/><circle cx="7" cy="7" r="1.5"/></>,
    database: <><ellipse cx="12" cy="5" rx="9" ry="3"/><path d="M3 5v14c0 1.66 4 3 9 3s9-1.34 9-3V5"/><path d="M3 12c0 1.66 4 3 9 3s9-1.34 9-3"/></>,
  };
  return <svg {...common}>{paths[name] ?? paths.archive}</svg>;
}

function CouponVault() {
  const [db, setDb] = useState<IDBDatabase | null>(null);
  const [records, setRecords] = useState<CouponRecord[]>([]);
  const [today, setToday] = useState("");
  const [ready, setReady] = useState(false);
  const [storageError, setStorageError] = useState("");
  const [formOpen, setFormOpen] = useState(false);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [form, setForm] = useState<CouponForm>(EMPTY_FORM);
  const [search, setSearch] = useState("");
  const [filter, setFilter] = useState<"all" | Status>("all");
  const [categoryFilter, setCategoryFilter] = useState<string>("all");
  const [notice, setNotice] = useState("");
  const [formError, setFormError] = useState("");
  const [sidebarCollapsed, setSidebarCollapsed] = useState(false);
  const [mobileMenuOpen, setMobileMenuOpen] = useState(false);
  const importRef = useRef<HTMLInputElement>(null);
  const searchRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    const handleShortcut = (event: KeyboardEvent) => {
      if ((event.metaKey || event.ctrlKey) && event.key.toLowerCase() === "k") {
        event.preventDefault();
        searchRef.current?.focus();
      }
      if ((event.metaKey || event.ctrlKey) && event.key.toLowerCase() === "b") {
        event.preventDefault();
        setSidebarCollapsed((prev) => !prev);
      }
      if (event.key === "Escape") {
        if (formOpen) setFormOpen(false);
        if (mobileMenuOpen) setMobileMenuOpen(false);
      }
    };
    window.addEventListener("keydown", handleShortcut);
    return () => window.removeEventListener("keydown", handleShortcut);
  }, [formOpen, mobileMenuOpen]);

  useEffect(() => {
    setToday(localDateKey());
    openDatabase().then(async (opened) => {
      setDb(opened);
      setRecords(await readAll(opened));
      setReady(true);
    }).catch(() => {
      setStorageError("This browser could not open local storage. Try a current version of Chrome, Safari, or Firefox with site storage enabled.");
      setReady(true);
    });
  }, []);

  const counts = useMemo(() => {
    const result = {
      all: records.length,
      active: 0,
      soon: 0,
      expired: 0,
      activated: 0,
      undated: 0,
      gemini: 0,
      canva: 0,
      other: 0,
    };
    records.forEach((record) => {
      const s = statusOf(record, today);
      result[s] += 1;
      const cat = (record.category || "").toLowerCase();
      if (cat.includes("gemini")) result.gemini += 1;
      else if (cat.includes("canva")) result.canva += 1;
      else result.other += 1;
    });
    return result;
  }, [records, today]);

  const visibleRecords = useMemo(() => records.filter((record) => {
    const status = statusOf(record, today);
    const matchesStatus = filter === "all" || status === filter;

    const recordCategory = record.category || "Gemini Pro";
    let matchesCategory = true;
    if (categoryFilter === "Gemini Pro") matchesCategory = recordCategory.toLowerCase().includes("gemini");
    else if (categoryFilter === "Canva Pro") matchesCategory = recordCategory.toLowerCase().includes("canva");
    else if (categoryFilter === "Other") matchesCategory = !recordCategory.toLowerCase().includes("gemini") && !recordCategory.toLowerCase().includes("canva");
    else if (categoryFilter !== "all") matchesCategory = recordCategory.toLowerCase() === categoryFilter.toLowerCase();

    const needle = search.trim().toLowerCase();
    const matchesSearch = !needle || [record.title, record.source, record.url, record.notes, record.category].some((value) => (value || "").toLowerCase().includes(needle));

    return matchesStatus && matchesCategory && matchesSearch;
  }), [records, filter, categoryFilter, search, today]);

  function openNewForm(presetCategory = "Gemini Pro") {
    setEditingId(null);
    const defaultTitle = presetCategory === "Canva Pro" ? "Canva Pro · 12 months" : presetCategory === "Gemini Pro" ? "Gemini Pro · 18 months" : "Coupon Link Offer";
    setForm({
      ...EMPTY_FORM,
      category: presetCategory,
      title: defaultTitle,
      receivedAt: today || localDateKey(),
    });
    setFormError("");
    setFormOpen(true);
    setNotice("");
  }

  function editRecord(record: CouponRecord) {
    setEditingId(record.id);
    setForm({
      title: record.title,
      category: record.category || "Gemini Pro",
      url: record.url,
      source: record.source,
      receivedAt: record.receivedAt,
      expiresAt: record.expiresAt,
      notes: record.notes,
    });
    setFormError("");
    setFormOpen(true);
    setNotice("");
  }

  async function refreshRecords() {
    if (db) setRecords(await readAll(db));
  }

  async function submitForm(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setFormError("");
    if (!db) {
      setFormError("Local storage is not ready yet.");
      return;
    }
    if (!validHttpUrl(form.url.trim())) {
      setFormError("Enter a complete link beginning with https:// or http://.");
      return;
    }
    if (form.expiresAt && form.receivedAt && form.expiresAt < form.receivedAt) {
      setFormError("Expiry date should be the same as or later than the received date.");
      return;
    }
    const existing = editingId ? records.find((record) => record.id === editingId) : undefined;
    const now = new Date().toISOString();
    const record: CouponRecord = {
      id: editingId ?? (typeof crypto !== "undefined" && "randomUUID" in crypto ? crypto.randomUUID() : `coupon-${Date.now().toString(36)}`),
      title: form.title.trim() || `${form.category || "Coupon"} Offer`,
      category: form.category.trim() || "Gemini Pro",
      url: form.url.trim(),
      source: form.source.trim(),
      receivedAt: form.receivedAt,
      expiresAt: form.expiresAt,
      notes: form.notes.trim(),
      activatedAt: existing?.activatedAt ?? "",
      createdAt: existing?.createdAt ?? now,
      updatedAt: now,
    };
    try {
      await saveRecord(db, record);
      await refreshRecords();
      setFormOpen(false);
      setEditingId(null);
      setNotice(editingId ? "Coupon details updated on this device." : `New ${record.category} coupon saved.`);
      setSearch("");
    } catch {
      setFormError("Could not save this coupon. Check browser storage settings and try again.");
    }
  }

  async function toggleActivated(record: CouponRecord) {
    if (!db) return;
    const updated = {
      ...record,
      activatedAt: record.activatedAt ? "" : new Date().toISOString(),
      updatedAt: new Date().toISOString(),
    };
    try {
      await saveRecord(db, updated);
      await refreshRecords();
      setNotice(updated.activatedAt ? "Marked as activated." : "Activation mark removed.");
    } catch {
      setNotice("Could not update the record. Please try again.");
    }
  }

  async function removeRecord(record: CouponRecord) {
    if (!db || !window.confirm(`Delete “${record.title}” from this device? This cannot be undone unless you have a backup.`)) return;
    try {
      await deleteRecord(db, record.id);
      await refreshRecords();
      setNotice("Coupon deleted from this device.");
    } catch {
      setNotice("Could not delete the record. Please try again.");
    }
  }

  async function copyLink(record: CouponRecord) {
    try {
      await navigator.clipboard.writeText(record.url);
      setNotice("Link copied to clipboard.");
    } catch {
      setNotice("Clipboard access was blocked. Open the coupon and copy the link from your browser address bar.");
    }
  }

  function exportBackup() {
    const backup = { app: "Coupon Link Vault", version: 1, exportedAt: new Date().toISOString(), records };
    const blob = new Blob([JSON.stringify(backup, null, 2)], { type: "application/json" });
    const url = URL.createObjectURL(blob);
    const anchor = document.createElement("a");
    anchor.href = url;
    anchor.download = `coupon-link-vault-${localDateKey()}.json`;
    document.body.appendChild(anchor);
    anchor.click();
    anchor.remove();
    window.setTimeout(() => URL.revokeObjectURL(url), 1000);
    setNotice("Backup exported successfully. Keep the file somewhere safe.");
  }

  async function importBackup(event: ChangeEvent<HTMLInputElement>) {
    const file = event.target.files?.[0];
    event.target.value = "";
    if (!file || !db) return;
    try {
      const parsed = JSON.parse(await file.text()) as { records?: unknown } | unknown[];
      const incoming = Array.isArray(parsed) ? parsed : (parsed && typeof parsed === "object" && "records" in parsed && Array.isArray(parsed.records) ? parsed.records : null);
      if (!incoming || incoming.length > 10000) throw new Error("The backup file does not contain a valid records list.");
      const clean: CouponRecord[] = incoming.map((item) => {
        if (!item || typeof item !== "object") throw new Error("A record in the backup is invalid.");
        const value = item as Partial<CouponRecord>;
        if (typeof value.url !== "string" || !validHttpUrl(value.url) || typeof value.id !== "string") throw new Error("A record has an invalid URL or ID.");
        const titleStr = String(value.title ?? "Gemini Pro · 18 months").slice(0, 200);
        const categoryStr = String(value.category ?? (titleStr.toLowerCase().includes("canva") ? "Canva Pro" : "Gemini Pro")).slice(0, 100);
        return {
          id: value.id.slice(0, 120),
          title: titleStr,
          category: categoryStr,
          url: value.url.slice(0, 4000),
          source: String(value.source ?? "").slice(0, 200),
          receivedAt: String(value.receivedAt ?? "").slice(0, 10),
          expiresAt: String(value.expiresAt ?? "").slice(0, 10),
          notes: String(value.notes ?? "").slice(0, 2000),
          activatedAt: String(value.activatedAt ?? ""),
          createdAt: String(value.createdAt ?? new Date().toISOString()),
          updatedAt: new Date().toISOString(),
        };
      });
      if (!window.confirm(`Import ${clean.length} coupon record(s)? Matching IDs will be updated. This happens only in this browser.`)) return;
      for (const record of clean) await saveRecord(db, record);
      await refreshRecords();
      setNotice(`Imported ${clean.length} record(s) to this device.`);
    } catch (error) {
      setNotice(error instanceof Error ? error.message : "Could not read that backup file.");
    }
  }

  return (
    <div className={`app-shell ${sidebarCollapsed ? "sidebar-collapsed" : ""}`}>
      {/* Mobile drawer backdrop */}
      {mobileMenuOpen && (
        <div
          className="mobile-backdrop"
          onClick={() => setMobileMenuOpen(false)}
          aria-hidden="true"
        />
      )}

      {/* Hidden file input for importing backup */}
      <input
        ref={importRef}
        className="visually-hidden"
        type="file"
        accept="application/json,.json"
        onChange={importBackup}
        aria-label="Choose a coupon backup file"
      />

      {/* Modern Collapsible Left Sidebar */}
      <aside className={`app-sidebar ${mobileMenuOpen ? "mobile-open" : ""}`} aria-label="Sidebar navigation">
        <div className="sidebar-top">
          <a className="sidebar-brand" href="#top" aria-label="Coupon Link Vault Home">
            <span className="brand-glow-mark">
              <Icon name="archive" size={20} />
            </span>
            <div className="brand-labels">
              <span className="brand-title">coupon<span className="brand-accent">vault</span></span>
              <span className="brand-subtitle">DEVICE LINK ARCHIVE</span>
            </div>
          </a>

          <button
            type="button"
            className="sidebar-collapse-toggle desktop-only"
            onClick={() => setSidebarCollapsed(!sidebarCollapsed)}
            title={sidebarCollapsed ? "Expand sidebar (⌘B)" : "Collapse sidebar (⌘B)"}
            aria-label="Toggle sidebar collapse"
          >
            <Icon name="panelLeft" size={17} />
          </button>

          <button
            type="button"
            className="sidebar-close-toggle mobile-only"
            onClick={() => setMobileMenuOpen(false)}
            aria-label="Close menu"
          >
            <Icon name="close" size={18} />
          </button>
        </div>

        {/* Sidebar Primary Action */}
        <div className="sidebar-action-container">
          <button
            type="button"
            className="sidebar-cta-btn"
            onClick={() => {
              openNewForm(categoryFilter !== "all" ? categoryFilter : "Gemini Pro");
              setMobileMenuOpen(false);
            }}
          >
            <Icon name="plus" size={17} />
            <span className="sidebar-cta-text">Add Coupon</span>
          </button>
        </div>

        {/* Navigation Categories */}
        <nav className="sidebar-nav">
          {/* LINK SERVICE CATEGORIES (NEW) */}
          <div className="sidebar-section-label">SERVICES / CATEGORIES</div>

          <button
            type="button"
            className={`nav-button ${categoryFilter === "all" ? "active" : ""}`}
            onClick={() => { setCategoryFilter("all"); setMobileMenuOpen(false); }}
          >
            <span className="nav-icon"><Icon name="archive" size={16} /></span>
            <span className="nav-text">All Services</span>
            <span className="nav-count">{counts.all}</span>
          </button>

          <button
            type="button"
            className={`nav-button ${categoryFilter === "Gemini Pro" ? "active" : ""}`}
            onClick={() => { setCategoryFilter("Gemini Pro"); setMobileMenuOpen(false); }}
          >
            <span className="nav-icon tone-blue"><Icon name="sparkles" size={16} /></span>
            <span className="nav-text">Gemini Pro</span>
            <span className="nav-count badge-blue">{counts.gemini}</span>
          </button>

          <button
            type="button"
            className={`nav-button ${categoryFilter === "Canva Pro" ? "active" : ""}`}
            onClick={() => { setCategoryFilter("Canva Pro"); setMobileMenuOpen(false); }}
          >
            <span className="nav-icon tone-purple"><Icon name="palette" size={16} /></span>
            <span className="nav-text">Canva Pro</span>
            <span className="nav-count badge-purple">{counts.canva}</span>
          </button>

          {counts.other > 0 && (
            <button
              type="button"
              className={`nav-button ${categoryFilter === "Other" ? "active" : ""}`}
              onClick={() => { setCategoryFilter("Other"); setMobileMenuOpen(false); }}
            >
              <span className="nav-icon tone-muted"><Icon name="tag" size={16} /></span>
              <span className="nav-text">Other Offers</span>
              <span className="nav-count">{counts.other}</span>
            </button>
          )}

          {/* STATUS FILTER */}
          <div className="sidebar-section-label">STATUS FILTER</div>

          <button
            type="button"
            className={`nav-button ${filter === "all" ? "active" : ""}`}
            onClick={() => { setFilter("all"); setMobileMenuOpen(false); }}
          >
            <span className="nav-icon"><Icon name="archive" size={16} /></span>
            <span className="nav-text">All Statuses</span>
            <span className="nav-count">{counts.all}</span>
          </button>

          <button
            type="button"
            className={`nav-button ${filter === "active" ? "active" : ""}`}
            onClick={() => { setFilter("active"); setMobileMenuOpen(false); }}
          >
            <span className="nav-icon tone-blue"><Icon name="sparkles" size={16} /></span>
            <span className="nav-text">Active Links</span>
            <span className="nav-count badge-blue">{counts.active}</span>
          </button>

          <button
            type="button"
            className={`nav-button ${filter === "soon" ? "active" : ""}`}
            onClick={() => { setFilter("soon"); setMobileMenuOpen(false); }}
          >
            <span className="nav-icon tone-amber"><Icon name="clock" size={16} /></span>
            <span className="nav-text">Expiring Soon</span>
            <span className="nav-count badge-amber">{counts.soon}</span>
          </button>

          <button
            type="button"
            className={`nav-button ${filter === "expired" ? "active" : ""}`}
            onClick={() => { setFilter("expired"); setMobileMenuOpen(false); }}
          >
            <span className="nav-icon tone-rose"><Icon name="calendar" size={16} /></span>
            <span className="nav-text">Expired</span>
            <span className="nav-count badge-rose">{counts.expired}</span>
          </button>

          <button
            type="button"
            className={`nav-button ${filter === "activated" ? "active" : ""}`}
            onClick={() => { setFilter("activated"); setMobileMenuOpen(false); }}
          >
            <span className="nav-icon tone-emerald"><Icon name="check" size={16} /></span>
            <span className="nav-text">Activated</span>
            <span className="nav-count badge-emerald">{counts.activated}</span>
          </button>

          <div className="sidebar-section-label">BACKUP & TOOLS</div>

          <button
            type="button"
            className="nav-button"
            onClick={() => { exportBackup(); setMobileMenuOpen(false); }}
            disabled={!records.length}
          >
            <span className="nav-icon"><Icon name="download" size={16} /></span>
            <span className="nav-text">Export Backup</span>
            <span className="nav-pill-badge">JSON</span>
          </button>

          <button
            type="button"
            className="nav-button"
            onClick={() => { importRef.current?.click(); setMobileMenuOpen(false); }}
          >
            <span className="nav-icon"><Icon name="upload" size={16} /></span>
            <span className="nav-text">Import Backup</span>
            <span className="nav-pill-badge">JSON</span>
          </button>
        </nav>

        {/* Sidebar Footer Indicator */}
        <div className="sidebar-footer">
          <div className="storage-status-card">
            <div className="storage-status-header">
              <span className="live-status-dot" />
              <span className="storage-status-title">Private Local Archive</span>
            </div>
            <p className="storage-status-desc">
              IndexedDB + Supabase ready. No tracking, completely private.
            </p>
          </div>
        </div>
      </aside>

      {/* Main Panel */}
      <div className="app-main-pane">
        {/* Sleek Top Header */}
        <header className="app-topbar">
          <div className="topbar-left">
            <button
              type="button"
              className="topbar-action-icon mobile-only"
              onClick={() => setMobileMenuOpen(true)}
              aria-label="Open menu"
            >
              <Icon name="menu" size={20} />
            </button>

            <button
              type="button"
              className="topbar-action-icon desktop-only"
              onClick={() => setSidebarCollapsed(!sidebarCollapsed)}
              title={sidebarCollapsed ? "Expand sidebar (⌘B)" : "Collapse sidebar (⌘B)"}
              aria-label="Toggle sidebar"
            >
              <Icon name="panelLeft" size={18} />
            </button>

            {/* Global Search Bar */}
            <div className="header-search-bar">
              <Icon name="search" size={16} />
              <input
                ref={searchRef}
                type="search"
                placeholder="Search Gemini, Canva, links, partners, notes..."
                value={search}
                onChange={(e) => setSearch(e.target.value)}
                aria-label="Search archive"
              />
              <kbd className="search-kbd">⌘K</kbd>
            </div>
          </div>

          <div className="topbar-right">
            {/* Live Security indicator */}
            <div className="device-status-badge">
              <span className="device-status-dot" />
              <span className="device-status-text">Local Only</span>
            </div>

            {/* Quick Export Button */}
            <button
              type="button"
              className="topbar-button topbar-secondary-btn"
              onClick={exportBackup}
              disabled={!records.length}
              title="Download JSON backup"
            >
              <Icon name="download" size={15} />
              <span className="button-text">Export</span>
            </button>

            {/* Quick Add Button */}
            <button
              type="button"
              className="topbar-button topbar-primary-btn"
              onClick={() => openNewForm(categoryFilter !== "all" ? categoryFilter : "Gemini Pro")}
            >
              <Icon name="plus" size={16} />
              <span className="button-text">Add Coupon</span>
            </button>
          </div>
        </header>

        {/* Scrollable Content Container */}
        <main className="app-content-body">
          {/* Notifications */}
          {storageError && <div className="notice notice-error" role="alert">{storageError}</div>}
          {notice && (
            <div className="notice" role="status">
              <span>{notice}</span>
              <button type="button" aria-label="Dismiss message" onClick={() => setNotice("")}>
                <Icon name="close" size={15} />
              </button>
            </div>
          )}

          {/* Hero Section */}
          <section className="hero-banner" id="top">
            <div className="hero-content">
              <div className="hero-eyebrow">
                <span className="eyebrow-accent" />
                <span>OFFLINE LINK VAULT · GEMINI & CANVA PRO</span>
              </div>
              <h1 className="hero-title">
                Manage Gemini & Canva<br />
                <span className="title-gradient">coupon links with ease.</span>
              </h1>
              <p className="hero-description">
                Organize your Gemini Pro 18-month and Canva Pro subscription promotion links, keep track of expiration dates, and backup securely.
              </p>
              <div className="hero-buttons">
                <button
                  type="button"
                  className="hero-btn-primary"
                  onClick={() => openNewForm("Gemini Pro")}
                >
                  <Icon name="sparkles" size={16} /> + Gemini Pro
                </button>
                <button
                  type="button"
                  className="hero-btn-purple"
                  onClick={() => openNewForm("Canva Pro")}
                >
                  <Icon name="palette" size={16} /> + Canva Pro
                </button>
                <button type="button" className="hero-btn-secondary" onClick={() => importRef.current?.click()}>
                  <Icon name="upload" size={16} /> Import backup
                </button>
              </div>
            </div>

            <div className="hero-visual" aria-hidden="true">
              <div className="visual-glow-ring" />
              <div className="visual-card visual-card-back">
                <div className="card-front-top">
                  <span className="card-gem-icon purple"><Icon name="palette" size={15} /></span>
                  <span className="card-status-badge"><span /> CANVA</span>
                </div>
                <div className="card-front-title">Canva Pro</div>
                <div className="card-front-subtitle">12 Month VIP Access</div>
                <span className="card-skeleton skeleton-sm" />
                <span className="card-skeleton skeleton-md" />
              </div>
              <div className="visual-card visual-card-front">
                <div className="card-front-top">
                  <span className="card-gem-icon"><Icon name="sparkles" size={15} /></span>
                  <span className="card-status-badge"><span /> GEMINI</span>
                </div>
                <div className="card-front-title">Gemini Pro</div>
                <div className="card-front-subtitle">18 Month Extended Promo</div>
                <div className="card-front-divider" />
                <div className="card-front-bottom">
                  <span><small>STATUS</small><b>ACTIVE</b></span>
                  <span className="card-cal-icon"><Icon name="calendar" size={18} /></span>
                </div>
              </div>
              <div className="visual-stamp">
                <Icon name="shield" size={15} />
                <span>LOCAL<br />ONLY</span>
              </div>
            </div>
          </section>

          {/* Metric Cards Grid */}
          <section className="metrics-grid" aria-label="Coupon overview metrics">
            <MetricCard
              label="Saved links"
              value={counts.all}
              note="Total across all services"
              icon="archive"
              tone="blue"
              onClick={() => { setFilter("all"); setCategoryFilter("all"); }}
              active={filter === "all" && categoryFilter === "all"}
            />
            <MetricCard
              label="Gemini Pro"
              value={counts.gemini}
              note="18-Month promo links"
              icon="sparkles"
              tone="blue"
              onClick={() => setCategoryFilter("Gemini Pro")}
              active={categoryFilter === "Gemini Pro"}
            />
            <MetricCard
              label="Canva Pro"
              value={counts.canva}
              note="Pro team & personal passes"
              icon="palette"
              tone="purple"
              onClick={() => setCategoryFilter("Canva Pro")}
              active={categoryFilter === "Canva Pro"}
            />
            <MetricCard
              label="Expiring soon"
              value={counts.soon}
              note="Within next 7 days"
              icon="clock"
              tone="gold"
              onClick={() => setFilter("soon")}
              active={filter === "soon"}
            />
          </section>

          {/* Add / Edit Form Panel */}
          {formOpen && (
            <section className="form-container-card" aria-labelledby="form-heading">
              <div className="form-card-header">
                <div>
                  <div className="form-eyebrow">ARCHIVE ENTRY</div>
                  <h2 id="form-heading">{editingId ? "Edit coupon details" : `Save a new ${form.category} coupon`}</h2>
                  <p>Stored locally in IndexedDB. Fields with * are required.</p>
                </div>
                <button
                  type="button"
                  className="form-close-btn"
                  onClick={() => setFormOpen(false)}
                  aria-label="Close form"
                >
                  <Icon name="close" size={18} />
                </button>
              </div>

              <form onSubmit={submitForm} className="coupon-entry-form">
                {/* Category Selection Bar */}
                <div className="category-selection-row span-full">
                  <span className="selection-label">Select Service / Category:</span>
                  <div className="category-chips-list">
                    {CATEGORY_PRESETS.map((cat) => {
                      const isSelected = form.category === cat || (cat === "Other" && !CATEGORY_PRESETS.slice(0, 3).includes(form.category as any));
                      return (
                        <button
                          key={cat}
                          type="button"
                          className={`category-select-pill ${cat === "Gemini Pro" ? "pill-gemini" : cat === "Canva Pro" ? "pill-canva" : ""} ${isSelected ? "selected" : ""}`}
                          onClick={() => {
                            let newTitle = form.title;
                            if (!editingId) {
                              if (cat === "Gemini Pro") newTitle = "Gemini Pro · 18 months";
                              else if (cat === "Canva Pro") newTitle = "Canva Pro · 12 months";
                              else if (cat === "ChatGPT Plus") newTitle = "ChatGPT Plus · Promo";
                            }
                            setForm({ ...form, category: cat, title: newTitle });
                          }}
                        >
                          {cat === "Gemini Pro" && <Icon name="sparkles" size={14} />}
                          {cat === "Canva Pro" && <Icon name="palette" size={14} />}
                          {cat === "ChatGPT Plus" && <Icon name="tag" size={14} />}
                          <span>{cat}</span>
                        </button>
                      );
                    })}
                  </div>
                </div>

                {/* Custom Category Input if "Other" or custom */}
                {!["Gemini Pro", "Canva Pro", "ChatGPT Plus"].includes(form.category) && (
                  <label className="input-group span-full">
                    <span>Custom Service Name *</span>
                    <input
                      value={form.category === "Other" ? "" : form.category}
                      maxLength={100}
                      onChange={(e) => setForm({ ...form, category: e.target.value || "Other" })}
                      placeholder="e.g. Adobe Creative Cloud, Notion Plus, Spotify"
                      required
                    />
                  </label>
                )}

                <label className="input-group span-full">
                  <span>Coupon Label / Title *</span>
                  <input
                    value={form.title}
                    maxLength={200}
                    onChange={(e) => setForm({ ...form, title: e.target.value })}
                    placeholder={form.category === "Canva Pro" ? "Canva Pro · 12 months" : "Gemini Pro · 18 months"}
                    required
                  />
                </label>

                <label className="input-group span-full">
                  <span>Coupon activation link *</span>
                  <input
                    value={form.url}
                    onChange={(e) => setForm({ ...form, url: e.target.value })}
                    placeholder={form.category === "Canva Pro" ? "https://www.canva.com/brand/join?token=..." : "https://one.google.com/promo/..."}
                    type="url"
                    inputMode="url"
                    autoComplete="url"
                    required
                  />
                </label>

                <label className="input-group">
                  <span>Source / Partner</span>
                  <input
                    value={form.source}
                    maxLength={200}
                    onChange={(e) => setForm({ ...form, source: e.target.value })}
                    placeholder="e.g. Google One, Samsung Galaxy, Student Pack"
                  />
                </label>

                <label className="input-group">
                  <span>Date received</span>
                  <input
                    value={form.receivedAt}
                    onChange={(e) => setForm({ ...form, receivedAt: e.target.value })}
                    type="date"
                  />
                </label>

                <label className="input-group">
                  <span>Link expiry date</span>
                  <input
                    value={form.expiresAt}
                    onChange={(e) => setForm({ ...form, expiresAt: e.target.value })}
                    type="date"
                  />
                  <small>Enter the link's activation deadline, not the end of the subscription.</small>
                </label>

                <label className="input-group span-full">
                  <span>Private notes</span>
                  <textarea
                    value={form.notes}
                    maxLength={2000}
                    onChange={(e) => setForm({ ...form, notes: e.target.value })}
                    rows={3}
                    placeholder="Where you received it, account restrictions, reminders..."
                  />
                </label>

                {formError && <p className="form-error-msg" role="alert">{formError}</p>}

                <div className="form-action-footer">
                  <p className="privacy-reminder">
                    <Icon name="shield" size={16} />
                    <span>Your link stays on this device. Do not store passwords or verification codes here.</span>
                  </p>
                  <div className="form-buttons-group">
                    <button
                      type="button"
                      className="btn-cancel"
                      onClick={() => setFormOpen(false)}
                    >
                      Cancel
                    </button>
                    <button
                      type="submit"
                      className="btn-save"
                      disabled={!ready || !!storageError}
                    >
                      <Icon name="check" size={16} />
                      <span>{editingId ? "Save changes" : "Save coupon"}</span>
                    </button>
                  </div>
                </div>
              </form>
            </section>
          )}

          {/* Coupons Archive Section */}
          <section className="archive-card-wrapper" id="archive">
            <div className="archive-top-bar">
              <div>
                <div className="archive-eyebrow">YOUR COLLECTION</div>
                <h2 className="archive-title">
                  {categoryFilter === "all" ? "Saved Coupon Links" : `${categoryFilter} Coupons`}
                </h2>
                <p className="archive-subtitle">
                  {categoryFilter === "all"
                    ? "Search, filter, and manage your Gemini Pro, Canva Pro, and other vouchers."
                    : `Showing coupons in the ${categoryFilter} category.`}
                </p>
              </div>

              <div className="archive-top-actions">
                <button
                  type="button"
                  className="add-coupon-secondary"
                  onClick={() => openNewForm("Gemini Pro")}
                >
                  <Icon name="sparkles" size={15} />
                  <span>+ Gemini</span>
                </button>
                <button
                  type="button"
                  className="add-coupon-secondary canva-accent"
                  onClick={() => openNewForm("Canva Pro")}
                >
                  <Icon name="palette" size={15} />
                  <span>+ Canva</span>
                </button>
              </div>
            </div>

            {/* Category Filter Tabs Bar (NEW) */}
            <div className="service-tabs-bar" aria-label="Service categories">
              <button
                type="button"
                className={`service-tab-btn ${categoryFilter === "all" ? "active" : ""}`}
                onClick={() => setCategoryFilter("all")}
              >
                <span>All Services</span>
                <span className="tab-count">{counts.all}</span>
              </button>

              <button
                type="button"
                className={`service-tab-btn tab-gemini ${categoryFilter === "Gemini Pro" ? "active" : ""}`}
                onClick={() => setCategoryFilter("Gemini Pro")}
              >
                <Icon name="sparkles" size={14} />
                <span>Gemini Pro</span>
                <span className="tab-count count-blue">{counts.gemini}</span>
              </button>

              <button
                type="button"
                className={`service-tab-btn tab-canva ${categoryFilter === "Canva Pro" ? "active" : ""}`}
                onClick={() => setCategoryFilter("Canva Pro")}
              >
                <Icon name="palette" size={14} />
                <span>Canva Pro</span>
                <span className="tab-count count-purple">{counts.canva}</span>
              </button>

              {counts.other > 0 && (
                <button
                  type="button"
                  className={`service-tab-btn ${categoryFilter === "Other" ? "active" : ""}`}
                  onClick={() => setCategoryFilter("Other")}
                >
                  <Icon name="tag" size={14} />
                  <span>Other</span>
                  <span className="tab-count">{counts.other}</span>
                </button>
              )}
            </div>

            {/* Status filters strip */}
            <div className="filters-strip" aria-label="Filter status">
              {(["all", "active", "soon", "expired", "activated"] as const).map((item) => (
                <button
                  key={item}
                  type="button"
                  className={`filter-pill-btn ${filter === item ? "selected" : ""}`}
                  onClick={() => setFilter(item)}
                >
                  <span>{item === "all" ? "All statuses" : STATUS_LABEL[item as Status]}</span>
                  <span className="pill-number">{item === "all" ? counts.all : counts[item]}</span>
                </button>
              ))}
            </div>

            {/* List / Empty State */}
            {!ready ? (
              <div className="empty-archive-state">
                <span className="empty-state-icon"><Icon name="archive" size={26} /></span>
                <h3>Opening local archive…</h3>
                <p>Loading your coupon data from this browser's IndexedDB.</p>
              </div>
            ) : visibleRecords.length === 0 ? (
              <div className="empty-archive-state">
                <span className="empty-state-icon">
                  <Icon name={search || filter !== "all" || categoryFilter !== "all" ? "search" : "archive"} size={26} />
                </span>
                <h3>
                  {records.length
                    ? `No matching ${categoryFilter !== "all" ? categoryFilter : ""} coupons found`
                    : "Your archive is empty"}
                </h3>
                <p>
                  {records.length
                    ? "Try adjusting your search terms, status filters, or service categories."
                    : "Add your first Gemini Pro or Canva Pro coupon link to get started."}
                </p>
                <div className="empty-actions-row">
                  <button type="button" className="empty-cta-btn" onClick={() => openNewForm("Gemini Pro")}>
                    <Icon name="sparkles" size={16} />
                    <span>Add Gemini Pro</span>
                  </button>
                  <button type="button" className="empty-cta-btn btn-canva-purple" onClick={() => openNewForm("Canva Pro")}>
                    <Icon name="palette" size={16} />
                    <span>Add Canva Pro</span>
                  </button>
                </div>
              </div>
            ) : (
              <div className="coupon-cards-list">
                {visibleRecords.map((record, index) => (
                  <CouponCard
                    key={record.id}
                    record={record}
                    status={statusOf(record, today)}
                    index={index}
                    onCopy={copyLink}
                    onEdit={editRecord}
                    onToggle={toggleActivated}
                    onDelete={removeRecord}
                    onSelectCategory={(cat) => setCategoryFilter(cat)}
                  />
                ))}
              </div>
            )}

            <div className="archive-bottom-status">
              <span>Showing {visibleRecords.length} of {records.length} {records.length === 1 ? "link" : "links"}</span>
              <span className="device-safe-tag"><span className="live-status-dot" /> Stored locally</span>
            </div>
          </section>

          {/* Privacy & Expiry Notice Cards */}
          <section className="info-cards-row">
            <div className="info-card info-card-primary">
              <span className="info-card-icon"><Icon name="shield" size={20} /></span>
              <div>
                <h3>Private by design</h3>
                <p>Your coupon links are saved exclusively in IndexedDB inside this browser profile and can be synced to your Supabase PostgreSQL database anytime.</p>
              </div>
            </div>
            <div className="info-card info-card-amber">
              <span className="info-card-icon amber-icon"><Icon name="clock" size={20} /></span>
              <div>
                <h3>Expiry estimation</h3>
                <p>Statuses are calculated from the expiration dates you enter. This tool cannot verify redemption status with external Google/Canva APIs or extend an expired link.</p>
              </div>
            </div>
          </section>

          {/* Footer */}
          <footer className="app-footer">
            <div className="footer-brand">
              <span className="brand-glow-mark sm"><Icon name="archive" size={16} /></span>
              <span>coupon<span className="brand-accent">vault</span></span>
            </div>
            <span className="footer-tagline">Gemini Pro & Canva Pro Link Archive · Supabase PostgreSQL Ready</span>
            <a href="#top" className="back-to-top-link">
              <span>Back to top</span>
              <Icon name="arrow" size={14} />
            </a>
          </footer>
        </main>
      </div>
    </div>
  );
}

function MetricCard({
  label,
  value,
  note,
  icon,
  tone,
  onClick,
  active,
}: {
  label: string;
  value: number;
  note: string;
  icon: string;
  tone: "blue" | "gold" | "rose" | "green" | "purple";
  onClick?: () => void;
  active?: boolean;
}) {
  return (
    <button
      type="button"
      className={`metric-tile metric-tone-${tone} ${active ? "metric-active" : ""}`}
      onClick={onClick}
    >
      <div className="metric-tile-top">
        <span className={`metric-icon-box tone-${tone}`}><Icon name={icon} size={18} /></span>
        <span className="metric-index-counter">/ {String(value).padStart(2, "0")}</span>
      </div>
      <div className="metric-tile-content">
        <span className="metric-title-label">{label}</span>
        <strong className="metric-big-number">{value}</strong>
        <small className="metric-sub-note">{note}</small>
      </div>
    </button>
  );
}

function CouponCard({
  record,
  status,
  index,
  onCopy,
  onEdit,
  onToggle,
  onDelete,
  onSelectCategory,
}: {
  record: CouponRecord;
  status: Status;
  index: number;
  onCopy: (record: CouponRecord) => void;
  onEdit: (record: CouponRecord) => void;
  onToggle: (record: CouponRecord) => void;
  onDelete: (record: CouponRecord) => void;
  onSelectCategory?: (category: string) => void;
}) {
  const statusClass = `status-pill-${status}`;
  const days = record.expiresAt ? daysUntil(record.expiresAt, localDateKey()) : null;
  const isCanva = (record.category || "").toLowerCase().includes("canva") || record.title.toLowerCase().includes("canva");
  const isGemini = (record.category || "").toLowerCase().includes("gemini") || record.title.toLowerCase().includes("gemini");

  return (
    <article className="coupon-card-item">
      <div className="coupon-item-index">{String(index + 1).padStart(2, "0")}</div>
      <div className="coupon-item-body">
        <div className="coupon-item-title-row">
          {/* Branded Category Pill */}
          <button
            type="button"
            className={`service-badge ${isCanva ? "service-canva" : isGemini ? "service-gemini" : "service-other"}`}
            onClick={() => onSelectCategory?.(record.category || (isCanva ? "Canva Pro" : "Gemini Pro"))}
            title={`Filter by ${record.category || "category"}`}
          >
            {isCanva ? <Icon name="palette" size={13} /> : isGemini ? <Icon name="sparkles" size={13} /> : <Icon name="tag" size={13} />}
            <span>{record.category || (isCanva ? "Canva Pro" : "Gemini Pro")}</span>
          </button>

          <h3 className="coupon-title-text">{record.title}</h3>

          <span className={`status-pill ${statusClass}`}>
            <span className="status-dot" />
            {STATUS_LABEL[status]}
          </span>
        </div>

        <p className="coupon-url-preview">
          {record.url.replace(/^https?:\/\//, "").replace(/\/$/, "")}
        </p>

        <div className="coupon-meta-tags">
          <span className="meta-source-tag"><Icon name="tag" size={12} /> {record.source || "No source tag"}</span>
          <span className="meta-sep" />
          <span>Received {formatDate(record.receivedAt)}</span>
          <span className="meta-sep" />
          <span className={status === "expired" ? "text-danger" : status === "soon" ? "text-warning" : "text-muted"}>
            {record.expiresAt ? (
              status === "expired"
                ? `Expired ${Math.abs(days ?? 0)}d ago`
                : status === "soon"
                  ? (days === 0 ? "Expires today!" : `Expires in ${days}d`)
                  : `Expires ${formatDate(record.expiresAt)}`
            ) : "No expiry date"}
          </span>
        </div>

        {record.notes && <p className="coupon-notes-bubble">{record.notes}</p>}
      </div>

      <div className="coupon-actions-toolbar">
        <button
          type="button"
          className="action-btn copy-btn"
          onClick={() => onCopy(record)}
          title="Copy coupon link"
          aria-label={`Copy link for ${record.title}`}
        >
          <Icon name="copy" size={15} />
          <span>Copy</span>
        </button>

        <a
          href={record.url}
          target="_blank"
          rel="noopener noreferrer"
          className="action-btn open-btn"
          title="Open activation link in new tab"
        >
          <Icon name="external" size={15} />
          <span>Open</span>
        </a>

        <button
          type="button"
          className="action-btn edit-btn"
          onClick={() => onEdit(record)}
          title="Edit details"
          aria-label={`Edit ${record.title}`}
        >
          <span>Edit</span>
        </button>

        <button
          type="button"
          className={`action-btn activate-btn ${record.activatedAt ? "is-activated" : ""}`}
          onClick={() => onToggle(record)}
          title={record.activatedAt ? "Mark as unactivated" : "Mark as activated"}
        >
          <Icon name="check" size={15} />
          <span>{record.activatedAt ? "Activated" : "Mark used"}</span>
        </button>

        <button
          type="button"
          className="action-btn delete-btn"
          onClick={() => onDelete(record)}
          title="Delete coupon"
          aria-label={`Delete ${record.title}`}
        >
          <Icon name="trash" size={15} />
        </button>
      </div>
    </article>
  );
}
