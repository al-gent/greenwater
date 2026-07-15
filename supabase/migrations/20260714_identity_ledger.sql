-- Identity verification ledger (2026-07-14)
-- Records HOW a vessel's GFW mapping / MMSI was established, so provisional
-- (name-tier) matches can never silently pass for verified ones.
--   'callsign+name match' — call sign AND name both matched in GFW
--   'web-verified'        — checked against registries/trackers by research pass
--   'user-verified'       — confirmed by a human (e.g. Kaho via VesselFinder)

alter table vessels
  add column if not exists identity_source text,
  add column if not exists identity_verified_at timestamptz;
