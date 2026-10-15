-- Contained piggybacks: an MFP application whose dates sit entirely inside another
-- cruise on the same vessel is a project riding that sailing (mfp-api/QUIRKS.md #14).
-- Merge it: its project moves to the containing cruise and keeps its own dates as the
-- requested window; the inner cruise row and its entries go. Staggered overlaps are
-- left alone (same-day turnarounds, or MFP end-date sloppiness we can't distinguish).
-- Idempotent; one transaction.
create temp table piggyback on commit drop as
select b.id as inner_id, a.id as outer_id, b.departure_at as inner_dep, b.arrival_at as inner_arr
from cruises a join cruises b on a.vessel_id = b.vessel_id and a.id <> b.id
where a.source = 'unols_mfp' and b.source = 'unols_mfp' and a.cancelled_at is null and b.cancelled_at is null
  and b.departure_at >= a.departure_at and b.arrival_at <= a.arrival_at
  and not (a.departure_at = b.departure_at and a.arrival_at = b.arrival_at)
  and not exists (select 1 from cruises x where x.vessel_id = a.vessel_id and x.id not in (a.id, b.id) and x.cancelled_at is null
                  and x.departure_at <= a.departure_at and x.arrival_at >= a.arrival_at);  -- outer must be outermost

update projects p set cruise_id = g.outer_id,
  requested_start_earliest = coalesce(p.requested_start_earliest, g.inner_dep::date),
  requested_start_latest   = coalesce(p.requested_start_latest,   g.inner_dep::date),
  requested_science_days   = coalesce(p.requested_science_days,   (g.inner_arr::date - g.inner_dep::date) + 1)
from piggyback g where p.cruise_id = g.inner_id;

update cruise_people s set cruise_id = g.outer_id from piggyback g where s.cruise_id = g.inner_id;
update cruise_equipment e set cruise_id = g.outer_id from piggyback g where e.cruise_id = g.inner_id;

update cruises c set
  science_party_size = greatest(c.science_party_size, s.mx),
  external_refs = coalesce(c.external_refs, '{}'::jsonb) || jsonb_build_object('project_count', s.n, 'voyage_event_ids', s.ves)
from (select p.cruise_id, max(p.science_party_size) mx, count(*) n,
             jsonb_agg(p.external_refs->'voyage_event_id') filter (where p.external_refs ? 'voyage_event_id') ves
      from projects p where p.cruise_id in (select outer_id from piggyback) group by 1) s
where c.id = s.cruise_id;

-- entries of the inner cruise (vessel + seats) are soft-deleted; seats now belong to the outer
-- cruise but their entries still point at inner_id, so re-point them to the outer window.
update timeline_entries e set deleted_at = now() from piggyback g where e.cruise_id = g.inner_id and e.vessel_id is not null and e.deleted_at is null;
update timeline_entries e set cruise_id = g.outer_id, start_at = o.start_at, end_at = o.end_at
from piggyback g join timeline_entries o on o.cruise_id = g.outer_id and o.vessel_id is not null and o.deleted_at is null
where e.cruise_id = g.inner_id and e.seat_id is not null and e.deleted_at is null;

delete from cruises where id in (select inner_id from piggyback);

select count(*) as merged from piggyback;
