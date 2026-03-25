-- GFW Port Call Integration (2026-03-25)
-- Stores Global Fishing Watch vessel identity and port visit history.

-- GFW internal UUID, set once by scripts/load_gfw_data.mjs
ALTER TABLE vessels
  ADD COLUMN IF NOT EXISTS vessel_id_gfw text;

-- Full port call history (accumulates weekly via Vercel Cron → /api/admin/sync-gfw)
CREATE TABLE IF NOT EXISTS port_calls (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  vessel_id integer REFERENCES vessels(id) ON DELETE CASCADE,
  port_name text,
  port_flag text,
  lat numeric,
  lon numeric,
  arrived_at timestamptz,
  recorded_at timestamptz DEFAULT now(),
  UNIQUE(vessel_id, arrived_at)
);

-- Latest port call per vessel — used by getAllVessels() join and vessel detail page
CREATE OR REPLACE VIEW vessel_last_port AS
SELECT DISTINCT ON (vessel_id)
  vessel_id, port_name, port_flag, lat, lon, arrived_at
FROM port_calls
ORDER BY vessel_id, arrived_at DESC;
