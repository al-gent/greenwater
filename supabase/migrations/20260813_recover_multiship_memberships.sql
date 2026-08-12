-- Phase 5 (final phase) of the vessel_operators redesign: recover memberships
-- the legacy user migration dropped. It stored only shipIds[0] in the
-- single-vessel model; user_migrations.ship_ids kept the full arrays.
-- Affected: Mark Miller (Western Flyer, Dohrn, Odon de Buen — Cosmo survived)
-- and Larissa Pommeraud (Mojave ROV — Beagle survived). 4 rows. created_at
-- backdates to migrated_at so signup stats don't count them as new operators.
-- Data-only; schema.sql unaffected.
insert into vessel_operators (user_id, vessel_id, created_at)
select um.supabase_user_id, u.sid, um.migrated_at
from user_migrations um
cross join lateral unnest(um.ship_ids) as u(sid)
where array_length(um.ship_ids, 1) > 1
  and um.supabase_user_id is not null
on conflict do nothing;
