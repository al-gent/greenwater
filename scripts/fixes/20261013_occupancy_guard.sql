-- cruiseOccupancy() now ignores a mobilization AFTER departure or a demobilization BEFORE
-- arrival (as well as either being >14 days out). Re-derive the two vessel entries that
-- the one-sided guard got wrong. Idempotent.
update timeline_entries e set
  start_at = case when c.mobilization_at is not null and c.departure_at - c.mobilization_at between interval '0' and interval '14 days' then c.mobilization_at else c.departure_at end,
  end_at = greatest(
    case when c.demobilization_at is not null and c.demobilization_at - c.arrival_at between interval '0' and interval '14 days' then c.demobilization_at else c.arrival_at end
      + case when c.source = 'unols_mfp' then interval '1 day' else interval '0' end,
    case when c.mobilization_at is not null and c.departure_at - c.mobilization_at between interval '0' and interval '14 days' then c.mobilization_at else c.departure_at end + interval '1 day')
from cruises c
where e.cruise_id = c.id and e.vessel_id is not null and e.deleted_at is null
  and ((c.mobilization_at is not null and c.mobilization_at > c.departure_at)
    or (c.demobilization_at is not null and c.demobilization_at < c.arrival_at));
