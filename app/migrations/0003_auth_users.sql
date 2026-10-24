-- Migration 0003: User authentication and login logs
-- Compatible with Cloudflare D1 (SQLite) and PostgreSQL (Supabase)

CREATE TABLE IF NOT EXISTS users (
  id VARCHAR(120) PRIMARY KEY,
  email VARCHAR(255) UNIQUE NOT NULL,
  password_hash TEXT NOT NULL,
  name VARCHAR(255) DEFAULT 'AMF Staff',
  role VARCHAR(50) DEFAULT 'staff',
  status VARCHAR(50) DEFAULT 'active',
  last_login TEXT,
  created_at TEXT DEFAULT (datetime('now')),
  updated_at TEXT DEFAULT (datetime('now'))
);

CREATE TABLE IF NOT EXISTS login_logs (
  id VARCHAR(120) PRIMARY KEY,
  email VARCHAR(255) NOT NULL,
  ip_address VARCHAR(100) DEFAULT '127.0.0.1',
  user_agent TEXT DEFAULT '',
  status VARCHAR(50) DEFAULT 'success',
  logged_in_at TEXT DEFAULT (datetime('now'))
);

CREATE INDEX IF NOT EXISTS idx_users_email ON users (email);
CREATE INDEX IF NOT EXISTS idx_login_logs_email ON login_logs (email);

