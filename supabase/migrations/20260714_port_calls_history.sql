-- Port call history enrichment (2026-07-14)
--
-- Part 1 documents columns that already exist in production but were missing
-- from the repo (added manually in the SQL Editor during the March GFW work).
-- Parts 2-4 are new.

-- 1. Reverse-geocoded location fields (already live in prod)
alter table port_calls
  add column if not exists port_city    text,
  add column if not exists port_state   text,
  add column if not exists port_country text;

-- 2. Additional fields from GFW port visit events
alter table port_calls
  add column if not exists departed_at  timestamptz, -- event end (departure)
  add column if not exists duration_hrs numeric,     -- port_visit.durationHrs
  add column if not exists confidence   smallint;    -- port_visit.confidence (2=low..4=high)

-- 3. Recreate the latest-port view with all display columns.
--    Drop + create (not "or replace") because the live view's column order is
--    unknown after manual edits, and or-replace requires it to match.
drop view if exists vessel_last_port;
create view vessel_last_port as
select distinct on (vessel_id)
  vessel_id, port_name, port_flag, port_city, port_state, port_country,
  lat, lon, arrived_at, departed_at, duration_hrs
from port_calls
order by vessel_id, arrived_at desc;

-- 4. Per-vessel history queries (detail page track display)
create index if not exists idx_port_calls_vessel_arrived
  on port_calls (vessel_id, arrived_at desc);
