begin;

create function pg_temp.assert_true(condition boolean, message text) returns void language plpgsql as $$
begin
  if condition is distinct from true then raise exception '%', message; end if;
end
$$;

select pg_temp.assert_true((select count(*) = 3 from cruises where source = 'demo'), 'Expected three demo cruises after reseeding');
select pg_temp.assert_true((select count(*) = 4 from projects where source = 'demo'), 'Expected four demo projects after reseeding');
select pg_temp.assert_true((select count(*) = 3 from project_people), 'Duplicate example people');
select pg_temp.assert_true((select count(*) = 3 from project_gear), 'Duplicate example gear');
select pg_temp.assert_true((select count(*) = 3 from timeline_entries), 'Duplicate example timeline entries');
select pg_temp.assert_true((select count(*) = 3 from cruise_legs), 'Duplicate example legs');
select pg_temp.assert_true((select count(*) = 3 from cruise_stops), 'Duplicate example stops');

insert into cruises (vessel_id, title, slug, departure_at, arrival_at, published_at, source)
select id, 'Private MFP cruise', 'private-mfp-test', now(), now() + interval '2 days', now(), 'unols_mfp'
from vessels where name = 'Atlantis';
insert into cruises (vessel_id, title, slug, departure_at, arrival_at, published_at, source)
select vessel_id, 'Real operator cruise', 'real-operator-test', departure_at, arrival_at, now(), 'vesselconnect'
from cruises where source = 'demo' and slug = 'demo-carbon';
insert into cruises (vessel_id, title, slug, departure_at, arrival_at, source)
select vessel_id, 'Private operator draft', 'real-draft-test', departure_at, arrival_at, 'vesselconnect'
from cruises where slug = 'real-operator-test';
insert into projects (cruise_id, title, slug, published_at, source)
select id, 'Published project with draft cruise', 'real-draft-project', now(), 'vesselconnect' from cruises where slug = 'real-draft-test';
insert into projects (cruise_id, title, slug, published_at, source, external_id, raw)
select id, 'Private MFP research', 'private-mfp-project', now(), 'unols_mfp', 'publication-test', '{"preserve":"original payload"}' from cruises where slug = 'private-mfp-test';
insert into projects (cruise_id, title, slug, published_at, source)
select id, 'Project linked to held cruise', 'held-parent-project', now(), 'vesselconnect' from cruises where slug = 'private-mfp-test';
insert into people (name, source, external_id) values ('Private imported person', 'unols_mfp', 'publication-test');
insert into equipment (name, source, external_id) values ('Private imported equipment', 'unols_mfp_inventory', 'publication-test');
insert into equipment_locations (equipment_id, place) select id, 'Private location' from equipment where source = 'unols_mfp_inventory';
insert into project_people (project_id, role_id, person_id, name)
select project.id, role.id, person.id, person.name from projects project cross join cruise_roles role cross join people person
where project.slug = 'private-mfp-project' and role.slug = 'pi' and person.source = 'unols_mfp';
insert into project_gear (project_id, label) select id, 'Private imported gear' from projects where slug = 'private-mfp-project';
insert into cruise_people (cruise_id, role_id, person_id, name, source)
select cruise.id, role.id, person.id, person.name, 'unols_mfp' from cruises cruise cross join cruise_roles role cross join people person
where cruise.slug = 'private-mfp-test' and role.slug = 'pi' and person.source = 'unols_mfp';
insert into cruise_equipment (cruise_id, label, source) select id, 'Private request', 'unols_mfp_sme' from cruises where slug = 'private-mfp-test';
insert into people_credentials (person_id, credential_id) select person.id, credential.id from people person cross join credentials credential where person.source = 'unols_mfp' limit 1;
insert into cruise_legs (cruise_id, seq, depart_port, depart_at, arrive_port, arrive_at)
select id, 0, 'Private port', departure_at, 'Private port', arrival_at from cruises where slug = 'private-mfp-test';
insert into cruise_stops (cruise_id, seq, kind, name, lat, lon)
select id, 0, 'station', 'Private station', 40, -70 from cruises where slug = 'private-mfp-test';
insert into timeline_entries (vessel_id, cruise_id, start_at, end_at, source, visibility)
select vessel_id, id, departure_at, arrival_at, source, 'public' from cruises where slug in ('private-mfp-test', 'real-operator-test');
insert into timeline_entries (vessel_id, cruise_id, start_at, end_at, source, visibility)
select vessel_id, id, departure_at + interval '60 days', arrival_at + interval '60 days', source, 'operators' from cruises where slug = 'real-draft-test';
insert into timeline_entries (person_id, start_at, end_at, source, visibility, label)
select id, now(), now() + interval '1 day', 'vesselconnect', 'operators', 'Private resource block' from people where source = 'unols_mfp';

create function pg_temp.assert_hidden() returns void language plpgsql as $$
begin
  perform pg_temp.assert_true(not public.data_source_is_visible('unols_mfp_inventory'), 'MFP inventory prefix visible');
  perform pg_temp.assert_true(public.data_source_is_visible('vesselconnect'), 'Operator source hidden');
  perform pg_temp.assert_true((select count(*) = 1 from cruises where source = 'vesselconnect'), 'Real operator cruise hidden');
  perform pg_temp.assert_true((select count(*) = 3 from cruises where source = 'demo'), 'Demo cruises hidden');
  perform pg_temp.assert_true(not exists (select 1 from cruises where source = 'unols_mfp'), 'MFP cruises exposed');
  perform pg_temp.assert_true(not exists (select 1 from projects where source = 'unols_mfp'), 'MFP projects exposed');
  perform pg_temp.assert_true(exists (select 1 from projects where slug = 'real-draft-project'), 'Unrelated draft-cruise access changed');
  perform pg_temp.assert_true(not exists (select 1 from projects where slug = 'held-parent-project'), 'Held parent exposed through another source');
  perform pg_temp.assert_true(not exists (select 1 from people where source = 'unols_mfp'), 'MFP people exposed');
  perform pg_temp.assert_true(not exists (select 1 from equipment where source = 'unols_mfp_inventory'), 'MFP inventory exposed');
  perform pg_temp.assert_true(not exists (select 1 from equipment_locations), 'Equipment locations exposed');
  perform pg_temp.assert_true(not exists (select 1 from equipment_current_location), 'Definer view bypasses RLS');
  perform pg_temp.assert_true(not exists (select 1 from organizations where mfp_organisation_id is not null), 'MFP organizations exposed');
  perform pg_temp.assert_true(not exists (select 1 from project_people where name = 'Private imported person'), 'Project person exposed');
  perform pg_temp.assert_true(not exists (select 1 from project_gear where label = 'Private imported gear'), 'Project gear exposed');
  perform pg_temp.assert_true(not exists (select 1 from cruise_people), 'Cruise person exposed');
  perform pg_temp.assert_true(not exists (select 1 from cruise_equipment), 'Cruise equipment exposed');
  perform pg_temp.assert_true(not exists (select 1 from people_credentials), 'Person credentials exposed');
  perform pg_temp.assert_true(not exists (select 1 from cruise_legs where depart_port = 'Private port'), 'Cruise legs exposed');
  perform pg_temp.assert_true(not exists (select 1 from cruise_stops where name = 'Private station'), 'Cruise stops exposed');
  perform pg_temp.assert_true((select count(*) = case when current_user = 'authenticated' then 5 else 4 end from timeline_entries), 'Hidden timeline exposed or operator draft suppressed');
  begin
    update public.data_publication set enabled = true where source_group = 'mfp';
    raise exception 'Reader changed publication settings';
  exception when insufficient_privilege then null;
  end;
end
$$;

set local role anon;
select pg_temp.assert_hidden();
reset role;
set local role authenticated;
select pg_temp.assert_hidden();
reset role;

set local role service_role;
select pg_temp.assert_true((select raw->>'preserve' = 'original payload' from projects where slug = 'private-mfp-project'), 'Imported payload was changed or lost');
update public.data_publication set enabled = (source_group = 'mfp');
reset role;

set local role anon;
select pg_temp.assert_true((select count(*) = 1 from cruises where source = 'unols_mfp'), 'MFP did not reappear');
select pg_temp.assert_true((select count(*) = 1 from projects where source = 'unols_mfp'), 'MFP project did not reappear');
select pg_temp.assert_true((select count(*) = 1 from equipment_current_location), 'Equipment did not reappear');
select pg_temp.assert_true(not exists (select 1 from cruises where source = 'demo'), 'Demo cruises still visible');
select pg_temp.assert_true(not exists (select 1 from projects where source = 'demo'), 'Demo projects still visible');
select pg_temp.assert_true(not exists (select 1 from people where source = 'demo'), 'Demo people still visible');
select pg_temp.assert_true((select count(*) = 2 from timeline_entries), 'Demo timeline still visible');
reset role;
select pg_temp.assert_true((select count(*) = 3 from cruises where source = 'demo'), 'Demo rows were deleted instead of hidden');

rollback;
