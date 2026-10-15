-- One-off data fix (see mfp-api/QUIRKS.md #17). Idempotent.
-- 1. Two MFP test records leak into the public feed: unpublish them, soft-delete their entries.
update cruises set published_at = null
where slug in ('marcus-g-langseth-test-sme-to-review-skq-pm-workflow-2028-01', 'narragansett-dawn-test-2028-02');
update timeline_entries e set deleted_at = now()
from cruises c
where e.cruise_id = c.id and e.deleted_at is null
  and c.slug in ('marcus-g-langseth-test-sme-to-review-skq-pm-workflow-2028-01', 'narragansett-dawn-test-2028-02');

-- 2. Occupancy rule now ignores mob/demob more than 14 days from the cruise
--    (lib/timeline-service.ts cruiseOccupancy). Re-derive the entries that rule changes.
update timeline_entries e set
  start_at = case when c.mobilization_at is not null and c.departure_at - c.mobilization_at <= interval '14 days' then c.mobilization_at else c.departure_at end,
  end_at = greatest(
    case when c.demobilization_at is not null and c.demobilization_at - c.arrival_at <= interval '14 days' then c.demobilization_at else c.arrival_at end
      + case when c.source = 'unols_mfp' then interval '1 day' else interval '0' end,
    case when c.mobilization_at is not null and c.departure_at - c.mobilization_at <= interval '14 days' then c.mobilization_at else c.departure_at end + interval '1 day')
from cruises c
where e.cruise_id = c.id and e.vessel_id is not null and e.deleted_at is null
  and ((c.mobilization_at is not null and c.departure_at - c.mobilization_at > interval '14 days')
    or (c.demobilization_at is not null and c.demobilization_at - c.arrival_at > interval '14 days'));

-- expect 0:
select count(*) as entries_longer_than_cruise_plus_14d
from cruises c join timeline_entries e on e.cruise_id = c.id and e.vessel_id is not null and e.deleted_at is null
where (e.end_at::date - e.start_at::date) - (c.arrival_at::date - c.departure_at::date) > 14;
