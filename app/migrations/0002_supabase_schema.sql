-- Supabase / PostgreSQL Schema for Coupon Link Vault
-- Database: PostgreSQL 17+

CREATE TABLE IF NOT EXISTS coupons (
  id VARCHAR(120) PRIMARY KEY,
  title VARCHAR(255) NOT NULL,
  title_kh VARCHAR(255) DEFAULT '',
  url TEXT NOT NULL,
  url_or_code TEXT DEFAULT '',
  assigned_email VARCHAR(255) DEFAULT '',
  source VARCHAR(255) DEFAULT '',
  plan_tier VARCHAR(100) DEFAULT '',
  received_at VARCHAR(20) DEFAULT '',
  expires_at VARCHAR(20) DEFAULT '',
  category VARCHAR(100) DEFAULT 'gemini',
  status VARCHAR(50) DEFAULT 'ACTIVE',
  activated_at VARCHAR(40) DEFAULT '',
  google_check_status VARCHAR(50) DEFAULT '',
  google_checked_at VARCHAR(50) DEFAULT '',
  notes TEXT DEFAULT '',
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- Indexes for fast querying & filtering
CREATE INDEX IF NOT EXISTS idx_coupons_category ON coupons (category);
CREATE INDEX IF NOT EXISTS idx_coupons_expires_at ON coupons (expires_at);
CREATE INDEX IF NOT EXISTS idx_coupons_status ON coupons (status);
CREATE INDEX IF NOT EXISTS idx_coupons_created_at ON coupons (created_at);

-- Row Level Security (RLS) is recommended on Supabase
ALTER TABLE coupons ENABLE ROW LEVEL SECURITY;

-- Allow public read/write if using anon key, or customize for authenticated users
DROP POLICY IF EXISTS "Allow all operations for anon" ON coupons;
CREATE POLICY "Allow all operations for anon" ON coupons
  FOR ALL
  USING (true)
  WITH CHECK (true);
