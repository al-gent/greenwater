CREATE TABLE IF NOT EXISTS page_views (
  id          uuid        PRIMARY KEY DEFAULT gen_random_uuid(),
  site        text        NOT NULL CHECK (site IN ('app', 'cms')),
  path        text        NOT NULL,
  referrer    text,
  user_agent  text,
  created_at  timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS page_views_created_at_idx ON page_views (created_at DESC);
CREATE INDEX IF NOT EXISTS page_views_site_path_idx  ON page_views (site, path);

ALTER TABLE page_views ENABLE ROW LEVEL SECURITY;

CREATE POLICY "anon_insert_page_views"
  ON page_views
  FOR INSERT
  TO anon
  WITH CHECK (true);
