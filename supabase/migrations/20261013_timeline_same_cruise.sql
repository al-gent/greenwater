-- Double-booking means two DIFFERENT cruises on one resource at once. One person can hold
-- two seats on the same cruise (PI and chief scientist — MFP does this constantly), so the
-- exclusion constraints ignore overlaps within a cruise. A block has no cruise and stands
-- in for itself (coalesce to its own id), so it still conflicts with everything.
alter table timeline_entries
  drop constraint if exists no_vessel_overlap,
  drop constraint if exists no_person_overlap,
  drop constraint if exists no_equipment_overlap;

alter table timeline_entries
  add constraint no_vessel_overlap exclude using gist
    (vessel_id with =, coalesce(cruise_id, id) with <>, tstzrange(start_at, end_at) with &&)
    where (vessel_id is not null and source = 'vesselconnect' and deleted_at is null),
  add constraint no_person_overlap exclude using gist
    (person_id with =, coalesce(cruise_id, id) with <>, tstzrange(start_at, end_at) with &&)
    where (person_id is not null and source = 'vesselconnect' and deleted_at is null),
  add constraint no_equipment_overlap exclude using gist
    (equipment_id with =, coalesce(cruise_id, id) with <>, tstzrange(start_at, end_at) with &&)
    where (equipment_id is not null and source = 'vesselconnect' and deleted_at is null);
