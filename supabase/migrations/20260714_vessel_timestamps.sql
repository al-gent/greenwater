-- Listing timestamps (2026-07-14)
-- created_at: when the vessel entered OUR system. Legacy imported fleet gets
-- NULL (their true entry date is the bulk migration — not a meaningful signal).
-- last_updated: pre-existing column holding the source registry's own
-- last-modified date (2000-2019, 292 rows); from now on the human edit paths
-- (operator/admin saves, creation) overwrite it. Machine syncs never touch it.

alter table vessels add column if not exists created_at timestamptz default now();

-- ADD COLUMN with a default stamps every existing row with now() — undo that;
-- only vessels created after this migration carry a real created_at.
update vessels set created_at = null;
