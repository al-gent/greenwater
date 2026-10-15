-- Per-user display preferences (time zone, timeline scale). Same pattern as
-- notification_prefs: one jsonb column, an allowlisted API route (/api/preferences).
-- Keys: time_zone (IANA), timeline_px_per_day (number). Add keys in the route, not here.
alter table profiles add column if not exists preferences jsonb not null default '{}';
