ALTER TABLE page_views ADD COLUMN IF NOT EXISTS visitor_hash text;
CREATE INDEX IF NOT EXISTS page_views_visitor_hash_idx ON page_views (visitor_hash, created_at);
