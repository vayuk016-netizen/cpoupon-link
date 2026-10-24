-- D1 schema for System Tools & Coupon Vault.
-- Applied by the platform on deploy.

CREATE TABLE IF NOT EXISTS system_tools (
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
  notes TEXT,
  created_at TEXT DEFAULT (datetime('now')),
  updated_at TEXT DEFAULT (datetime('now'))
);

CREATE INDEX IF NOT EXISTS idx_system_tools_category ON system_tools (category);
CREATE INDEX IF NOT EXISTS idx_system_tools_status ON system_tools (status);
CREATE INDEX IF NOT EXISTS idx_system_tools_expiry ON system_tools (expiry_date);
