import { createFileRoute } from "@tanstack/react-router";
import { useEffect, useMemo, useRef, useState, type FormEvent, type ChangeEvent, type ReactNode } from "react";

export const Route = createFileRoute("/")({ component: CouponVault });

type CouponRecord = {
  id: string;
  title: string;
  url: string;
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
const EMPTY_FORM: CouponForm = { title: "Gemini Pro · 18 months", url: "", source: "", receivedAt: "", expiresAt: "", notes: "" };

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
    request.onsuccess = () => resolve((request.result as CouponRecord[]).sort((a, b) => (a.expiresAt || "9999-12-31").localeCompare(b.expiresAt || "9999-12-31")));
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

const STATUS_LABEL: Record<Status, string> = { active: "Active", soon: "Expiring soon", expired: "Expired", activated: "Activated", undated: "No expiry date" };
function formatDate(date: string): string {
  if (!date) return "Not set";
  const parsed = new Date(`${date}T12:00:00`);
  return Number.isNaN(parsed.getTime()) ? date : parsed.toLocaleDateString(undefined, { day: "numeric", month: "short", year: "numeric" });
}
function validHttpUrl(value: string): boolean {
  try { const url = new URL(value); return url.protocol === "https:" || url.protocol === "http:"; } catch { return false; }
}
function Icon({ name, size = 18 }: { name: string; size?: number }) {
  const common = { width: size, height: size, viewBox: "0 0 24 24", fill: "none", stroke: "currentColor", strokeWidth: 1.7, strokeLinecap: "round" as const, strokeLinejoin: "round" as const, "aria-hidden": true as const };
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
  const [notice, setNotice] = useState("");
  const [formError, setFormError] = useState("");
  const importRef = useRef<HTMLInputElement>(null);
  const searchRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    const handleShortcut = (event: KeyboardEvent) => {
      if ((event.metaKey || event.ctrlKey) && event.key.toLowerCase() === "k") {
        event.preventDefault();
        searchRef.current?.focus();
      }
    };
    window.addEventListener("keydown", handleShortcut);
    return () => window.removeEventListener("keydown", handleShortcut);
  }, []);

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
    const result = { all: records.length, active: 0, soon: 0, expired: 0, activated: 0, undated: 0 };
    records.forEach((record) => { result[statusOf(record, today)] += 1; });
    return result;
  }, [records, today]);

  const visibleRecords = useMemo(() => records.filter((record) => {
    const status = statusOf(record, today);
    const matchesFilter = filter === "all" || status === filter;
    const needle = search.trim().toLowerCase();
    const matchesSearch = !needle || [record.title, record.source, record.url, record.notes].some((value) => value.toLowerCase().includes(needle));
    return matchesFilter && matchesSearch;
  }), [records, filter, search, today]);

  function openNewForm() {
    setEditingId(null);
    setForm({ ...EMPTY_FORM, receivedAt: today || localDateKey() });
    setFormError("");
    setFormOpen(true);
    setNotice("");
  }

  function editRecord(record: CouponRecord) {
    setEditingId(record.id);
    setForm({ title: record.title, url: record.url, source: record.source, receivedAt: record.receivedAt, expiresAt: record.expiresAt, notes: record.notes });
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
    if (!db) { setFormError("Local storage is not ready yet."); return; }
    if (!validHttpUrl(form.url.trim())) { setFormError("Enter a complete link beginning with https:// or http://."); return; }
    if (form.expiresAt && form.receivedAt && form.expiresAt < form.receivedAt) { setFormError("Expiry date should be the same as or later than the received date."); return; }
    const existing = editingId ? records.find((record) => record.id === editingId) : undefined;
    const now = new Date().toISOString();
    const record: CouponRecord = {
      id: editingId ?? (typeof crypto !== "undefined" && "randomUUID" in crypto ? crypto.randomUUID() : `coupon-${Date.now().toString(36)}`),
      title: form.title.trim() || "Gemini Pro · 18 months",
      url: form.url.trim(), source: form.source.trim(), receivedAt: form.receivedAt,
      expiresAt: form.expiresAt, notes: form.notes.trim(), activatedAt: existing?.activatedAt ?? "",
      createdAt: existing?.createdAt ?? now, updatedAt: now,
    };
    try {
      await saveRecord(db, record);
      await refreshRecords();
      setFormOpen(false);
      setEditingId(null);
      setNotice(editingId ? "Coupon details updated on this device." : "Coupon saved on this device.");
      setSearch(""); setFilter("all");
    } catch { setFormError("Could not save this coupon. Check browser storage settings and try again."); }
  }

  async function toggleActivated(record: CouponRecord) {
    if (!db) return;
    const updated = { ...record, activatedAt: record.activatedAt ? "" : new Date().toISOString(), updatedAt: new Date().toISOString() };
    try { await saveRecord(db, updated); await refreshRecords(); setNotice(updated.activatedAt ? "Marked as activated." : "Activation mark removed."); }
    catch { setNotice("Could not update the record. Please try again."); }
  }

  async function removeRecord(record: CouponRecord) {
    if (!db || !window.confirm(`Delete “${record.title}” from this device? This cannot be undone unless you have a backup.`)) return;
    try { await deleteRecord(db, record.id); await refreshRecords(); setNotice("Coupon deleted from this device."); }
    catch { setNotice("Could not delete the record. Please try again."); }
  }

  async function copyLink(record: CouponRecord) {
    try {
      await navigator.clipboard.writeText(record.url);
      setNotice("Link copied to clipboard.");
    } catch { setNotice("Clipboard access was blocked. Open the coupon and copy the link from your browser address bar."); }
  }

  function exportBackup() {
    const backup = { app: "Coupon Link Vault", version: 1, exportedAt: new Date().toISOString(), records };
    const blob = new Blob([JSON.stringify(backup, null, 2)], { type: "application/json" });
    const url = URL.createObjectURL(blob);
    const anchor = document.createElement("a"); anchor.href = url; anchor.download = `coupon-link-vault-${localDateKey()}.json`; document.body.appendChild(anchor); anchor.click(); anchor.remove(); window.setTimeout(() => URL.revokeObjectURL(url), 1000);
    setNotice("Backup exported. Keep the file somewhere safe.");
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
        return {
          id: value.id.slice(0, 120), title: String(value.title ?? "Gemini Pro · 18 months").slice(0, 200), url: value.url.slice(0, 4000),
          source: String(value.source ?? "").slice(0, 200), receivedAt: String(value.receivedAt ?? "").slice(0, 10), expiresAt: String(value.expiresAt ?? "").slice(0, 10),
          notes: String(value.notes ?? "").slice(0, 2000), activatedAt: String(value.activatedAt ?? ""), createdAt: String(value.createdAt ?? new Date().toISOString()), updatedAt: new Date().toISOString(),
        };
      });
      if (!window.confirm(`Import ${clean.length} coupon record(s)? Matching IDs will be updated. This happens only in this browser.`)) return;
      for (const record of clean) await saveRecord(db, record);
      await refreshRecords(); setNotice(`Imported ${clean.length} record(s) to this device.`);
    } catch (error) { setNotice(error instanceof Error ? error.message : "Could not read that backup file."); }
  }

  return (
    <main className="vault-shell">
      <header className="topbar">
        <a className="brand" href="#top" aria-label="Coupon Link Vault home"><span className="brand-mark"><Icon name="archive" size={20} /></span><span>coupon<span className="brand-light">vault</span></span></a>
        <div className="topbar-right"><span className="local-pill"><span className="local-dot" /> Stored on this device</span><button className="button export-backup-button button-small" onClick={exportBackup} disabled={!records.length} type="button"><Icon name="download" size={15} /> Export backup</button></div>
      </header>

      <section className="hero" id="top">
        <div className="hero-copy">
          <div className="eyebrow"><span className="eyebrow-line" /> YOUR PERSONAL LINK ARCHIVE</div>
          <h1>Keep every link<br /><span>within reach.</span></h1>
          <p>Save your Gemini Pro 18-month coupon links, track dates, and know which ones need attention.</p>
          <div className="hero-actions"><button className="button hero-add-button" onClick={openNewForm} type="button"><Icon name="plus" size={17} /> Add a coupon</button><button className="button hero-import-button" onClick={() => importRef.current?.click()} type="button"><Icon name="upload" size={16} /> Import backup</button><input ref={importRef} className="visually-hidden" type="file" accept="application/json,.json" onChange={importBackup} aria-label="Choose a coupon backup file" /></div>
        </div>
        <div className="hero-art" aria-hidden="true">
          <div className="art-orbit art-orbit-one" /><div className="art-orbit art-orbit-two" />
          <div className="art-card art-card-back"><span className="art-card-kicker">REDEMPTION RECORD</span><span className="art-skeleton short" /><span className="art-skeleton" /><span className="art-skeleton medium" /></div>
          <div className="art-card art-card-front"><div className="art-card-head"><span className="art-mini-mark"><Icon name="archive" size={16} /></span><span className="art-state"><span /> SAVED</span></div><div className="art-card-title">Gemini Pro</div><div className="art-card-sub">18 month offer</div><div className="art-divider" /><div className="art-card-foot"><span><small>EXPIRES</small><b>- - -</b></span><span className="art-calendar"><Icon name="calendar" size={20} /></span></div></div>
          <div className="art-stamp"><Icon name="shield" size={16} /><span>LOCAL<br />ONLY</span></div><div className="art-number">01 / ARCHIVE</div>
        </div>
      </section>

      <section className="metrics" aria-label="Coupon overview">
        <Metric label="Saved links" value={counts.all} note="In this browser" icon="archive" tone="blue" />
        <Metric label="Expiring soon" value={counts.soon} note="Within 7 days" icon="clock" tone="gold" />
        <Metric label="Expired" value={counts.expired} note="Check offer terms" icon="calendar" tone="rose" />
        <Metric label="Activated" value={counts.activated} note="Marked by you" icon="check" tone="green" />
      </section>

      {storageError && <div className="notice notice-error" role="alert">{storageError}</div>}
      {notice && <div className="notice" role="status"><span>{notice}</span><button type="button" aria-label="Dismiss message" onClick={() => setNotice("")}><Icon name="close" size={15} /></button></div>}

      {formOpen && <section className="form-panel" aria-labelledby="form-title">
        <div className="panel-heading"><div><div className="eyebrow">NEW ARCHIVE ENTRY</div><h2 id="form-title">{editingId ? "Edit coupon details" : "Save a coupon link"}</h2><p>Only stored in this browser profile. Fields with * are required.</p></div><button className="icon-button" type="button" onClick={() => setFormOpen(false)} aria-label="Close form"><Icon name="close" /></button></div>
        <form onSubmit={submitForm} className="coupon-form">
          <label className="field field-wide"><span>Label *</span><input value={form.title} maxLength={200} onChange={(e) => setForm({ ...form, title: e.target.value })} placeholder="Gemini Pro · 18 months" required /></label>
          <label className="field field-wide"><span>Coupon activation link *</span><input value={form.url} onChange={(e) => setForm({ ...form, url: e.target.value })} placeholder="https://…" type="url" inputMode="url" autoComplete="url" required /></label>
          <label className="field"><span>Source / partner</span><input value={form.source} maxLength={200} onChange={(e) => setForm({ ...form, source: e.target.value })} placeholder="e.g. partner app" /></label>
          <label className="field"><span>Date received</span><input value={form.receivedAt} onChange={(e) => setForm({ ...form, receivedAt: e.target.value })} type="date" /></label>
          <label className="field"><span>Link expiry date</span><input value={form.expiresAt} onChange={(e) => setForm({ ...form, expiresAt: e.target.value })} type="date" /><small>Enter the link's deadline, not the 18-month subscription end date.</small></label>
          <label className="field"><span>Private notes</span><textarea value={form.notes} maxLength={2000} onChange={(e) => setForm({ ...form, notes: e.target.value })} rows={3} placeholder="Where it came from, offer terms, reminders…" /></label>
          {formError && <p className="form-error" role="alert">{formError}</p>}
          <div className="form-footer"><p><Icon name="shield" size={16} /> Your link stays on this device. Do not store Google passwords or verification codes here.</p><div><button className="button form-cancel-button" type="button" onClick={() => setFormOpen(false)}>Cancel</button><button className="button form-save-button" type="submit" disabled={!ready || !!storageError}><Icon name="check" size={16} /> {editingId ? "Save changes" : "Save coupon"}</button></div></div>
        </form>
      </section>}

      <section className="archive-section" id="archive">
        <div className="archive-heading"><div><div className="eyebrow">THE COLLECTION</div><h2>Your coupon archive</h2><p>Search, sort, and take action on your saved links.</p></div><button className="button archive-add-button add-secondary" type="button" onClick={openNewForm}><Icon name="plus" size={16} /> Add coupon</button></div>
        <div className="archive-tools"><label className="search-box"><Icon name="search" size={18} /><input ref={searchRef} aria-label="Search coupons" value={search} onChange={(e) => setSearch(e.target.value)} placeholder="Search labels, sources, notes…" /><kbd>⌘ K</kbd></label><div className="filter-list" aria-label="Filter by status">{(["all", "active", "soon", "expired", "activated"] as const).map((item) => <button key={item} type="button" className={`filter-chip ${filter === item ? "selected" : ""}`} onClick={() => setFilter(item)}>{item === "all" ? "All links" : STATUS_LABEL[item as Status]}<span>{item === "all" ? counts.all : counts[item]}</span></button>)}</div></div>
        {!ready ? <div className="empty-state"><span className="empty-icon"><Icon name="archive" size={25} /></span><h3>Opening your local archive…</h3><p>Your coupon data is read from this browser only.</p></div> : visibleRecords.length === 0 ? <div className="empty-state"><span className="empty-icon"><Icon name={search || filter !== "all" ? "search" : "archive"} size={25} /></span><h3>{records.length ? "No matching coupons" : "Your archive starts here"}</h3><p>{records.length ? "Try another search or status filter." : "Add your first coupon link to keep its details and deadline in one place."}</p>{!records.length && <button className="button empty-add-button" type="button" onClick={openNewForm}><Icon name="plus" size={16} /> Add your first coupon</button>}</div> : <div className="record-list">{visibleRecords.map((record, index) => <CouponCard key={record.id} record={record} status={statusOf(record, today)} index={index} onCopy={copyLink} onEdit={editRecord} onToggle={toggleActivated} onDelete={removeRecord} />)}</div>}
        <div className="archive-foot"><span>Showing {visibleRecords.length} of {records.length} {records.length === 1 ? "record" : "records"}</span><span><span className="local-dot" /> Saved locally</span></div>
      </section>

      <section className="bottom-notes">
        <div className="note-card note-main"><span className="note-icon"><Icon name="shield" size={20} /></span><div><h3>Private by design</h3><p>Your coupon records are saved in IndexedDB inside this browser profile. Nothing is uploaded by this tool. Export a backup before clearing browser data or changing devices.</p></div></div>
        <div className="note-card note-secondary"><span className="note-icon note-clock"><Icon name="clock" size={20} /></span><div><h3>Expiry is not extendable here</h3><p>Status is estimated from the date you enter. This tool cannot check Google's live redemption system or make an expired link valid again.</p></div></div>
      </section>
      <footer className="footer"><a className="brand footer-brand" href="#top"><span className="brand-mark"><Icon name="archive" size={17} /></span><span>coupon<span className="brand-light">vault</span></span></a><span>Personal archive · No account required</span><a href="#top" className="back-top">Back to top <Icon name="arrow" size={14} /></a></footer>
    </main>
  );
}

function Metric({ label, value, note, icon, tone }: { label: string; value: number; note: string; icon: string; tone: string }) {
  return <div className="metric-card"><span className={`metric-icon ${tone}`}><Icon name={icon} size={18} /></span><div className="metric-body"><span className="metric-label">{label}</span><strong>{value}</strong><small>{note}</small></div><span className="metric-index">/ {String(value).padStart(2, "0")}</span></div>;
}

function CouponCard({ record, status, index, onCopy, onEdit, onToggle, onDelete }: { record: CouponRecord; status: Status; index: number; onCopy: (record: CouponRecord) => void; onEdit: (record: CouponRecord) => void; onToggle: (record: CouponRecord) => void; onDelete: (record: CouponRecord) => void }) {
  const statusClass = status === "active" ? "status-active" : status === "soon" ? "status-soon" : status === "expired" ? "status-expired" : status === "activated" ? "status-activated" : "status-undated";
  const days = record.expiresAt ? daysUntil(record.expiresAt, localDateKey()) : null;
  return <article className="record-card">
    <div className="record-number">{String(index + 1).padStart(2, "0")}</div>
    <div className="record-primary"><div className="record-title-line"><h3>{record.title}</h3><span className={`status-pill ${statusClass}`}><span />{STATUS_LABEL[status]}</span></div><p className="record-url">{record.url.replace(/^https?:\/\//, "").replace(/\/$/, "")}</p><div className="record-meta"><span>{record.source || "Source not added"}</span><span className="meta-divider" /><span>Received {formatDate(record.receivedAt)}</span><span className="meta-divider" /><span className={status === "expired" ? "expiry-danger" : status === "soon" ? "expiry-warning" : ""}>{record.expiresAt ? (status === "expired" ? `Expired ${Math.abs(days ?? 0)}d ago` : status === "soon" ? (days === 0 ? "Expires today" : `Expires in ${days}d`) : `Expires ${formatDate(record.expiresAt)}`) : "No expiry date"}</span></div>{record.notes && <p className="record-notes">{record.notes}</p>}</div>
    <div className="record-actions"><button className="action-button" type="button" onClick={() => onCopy(record)} title="Copy link" aria-label={`Copy link for ${record.title}`}><Icon name="copy" size={16} /><span>Copy</span></button><a className="action-button" href={record.url} target="_blank" rel="noopener noreferrer" title="Open activation link"><Icon name="external" size={16} /><span>Open</span></a><button className="action-button action-more" type="button" onClick={() => onEdit(record)} title="Edit coupon" aria-label={`Edit ${record.title}`}>Edit</button><button className={`action-button ${record.activatedAt ? "action-done" : ""}`} type="button" onClick={() => onToggle(record)} title={record.activatedAt ? "Remove activation mark" : "Mark activated"}><Icon name="check" size={16} /><span>{record.activatedAt ? "Activated" : "Mark used"}</span></button><button className="action-delete" type="button" onClick={() => onDelete(record)} aria-label={`Delete ${record.title}`} title="Delete coupon"><Icon name="trash" size={16} /></button></div>
  </article>;
}
