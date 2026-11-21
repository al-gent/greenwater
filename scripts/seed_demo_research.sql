begin;

do $$
declare
  sample record;
  ship_id integer;
  sailing_id uuid;
  research_id uuid;
  scientist_id uuid;
  investigator_role uuid;
  sailing_start timestamptz;
  sailing_end timestamptz;
begin
  select id into investigator_role from public.cruise_roles where slug = 'pi';
  if investigator_role is null then raise exception 'Principal investigator role is missing'; end if;

  for sample in
    select * from (values
      ('carbon', 'Atlantis', 'Following carbon into the deep ocean', 'North Atlantic', 30, 12, 'Dr. Morgan Vale', 'Example Ocean Carbon Lab', 'CTD rosette and water sampling', 41.5, -70.7),
      ('reef', 'Roger Revelle', 'Listening to a changing reef', 'Eastern Pacific', 65, 9, 'Dr. Avery Chen', 'Example Marine Acoustics Lab', 'Passive acoustic recorder', 32.7, -117.2),
      ('plankton', 'Sikuliaq', 'Life beneath the seasonal ice', 'Gulf of Alaska', -75, 14, 'Dr. Robin Ellis', 'Example Polar Ecology Lab', 'Plankton net and imaging system', 60.1, -149.4)
    ) as samples(code, vessel_name, title, area, start_days, duration_days, scientist, affiliation, gear, latitude, longitude)
  loop
    select id into ship_id from public.vessels where name = sample.vessel_name and status = 'active' order by id limit 1;
    if ship_id is null then raise exception 'Demo vessel % is missing; no demo data was saved', sample.vessel_name; end if;
    sailing_start := (current_date + sample.start_days)::timestamptz;
    sailing_end := sailing_start + make_interval(days => sample.duration_days);

    insert into public.cruises (vessel_id, title, slug, cruise_code, operating_area, departure_at, arrival_at, published_at, source, external_refs, berths_open, science_party_size)
      values (ship_id, 'Example: ' || sample.title, 'demo-' || sample.code, 'DEMO-' || upper(sample.code), sample.area,
        sailing_start, sailing_end, now(), 'demo', '{"demo":true,"notice":"Fictional research, dates and people. Not an actual vessel booking or availability."}', 0, 8)
      on conflict (slug) do nothing;
    select id, departure_at, arrival_at into sailing_id, sailing_start, sailing_end from public.cruises where source = 'demo' and slug = 'demo-' || sample.code;
    if sailing_id is null then raise exception 'Demo slug % belongs to a non-demo cruise', sample.code; end if;

    insert into public.projects (cruise_id, title, slug, summary, source, external_id, area_label, requested_science_days, science_party_size)
      values (sailing_id, 'Example: ' || sample.title, 'demo-' || sample.code,
        case sample.code
          when 'carbon' then 'An illustrative expedition measuring how plankton, particles and deep-water currents move carbon below the surface. The example team combines water-column profiles with repeat sampling to compare coastal and offshore stations.'
          when 'reef' then 'An illustrative survey pairing underwater sound recordings with habitat observations to explore reef biodiversity. The example team compares dawn and dusk soundscapes and tests a repeatable monitoring method.'
          else 'An illustrative study of plankton communities during seasonal changes in polar waters. The example team combines net samples, imaging and temperature profiles to explore links between food webs and ocean conditions.'
        end || ' This is fictional demonstration content, not a real expedition or an endorsement by the vessel operator.',
        'demo', sample.code, sample.area, sample.duration_days, 8)
      on conflict (source, external_id) where external_id is not null do nothing;
    select id into research_id from public.projects where source = 'demo' and external_id = sample.code;

    insert into public.people (name, affiliation, source, external_id, notes)
      values (sample.scientist, sample.affiliation, 'demo', sample.code, 'Fictional person for demonstration only.')
      on conflict (source, external_id) where external_id is not null do nothing;
    select id into scientist_id from public.people where source = 'demo' and external_id = sample.code;

    insert into public.project_people (project_id, role_id, person_id, name, notes)
      select research_id, investigator_role, scientist_id, sample.scientist, 'Fictional example researcher.'
      where not exists (select 1 from public.project_people where project_id = research_id and person_id = scientist_id);
    insert into public.project_gear (project_id, label, quantity, notes)
      select research_id, sample.gear, 1, 'Illustrative requirement, not verified vessel equipment.'
      where not exists (select 1 from public.project_gear where project_id = research_id and label = sample.gear);
    insert into public.timeline_entries (vessel_id, cruise_id, start_at, end_at, all_day, tz, source, visibility, label)
      select ship_id, sailing_id, sailing_start, sailing_end, true, 'UTC', 'demo', 'public', 'Example only — not a booking'
      where not exists (select 1 from public.timeline_entries where cruise_id = sailing_id and vessel_id = ship_id and deleted_at is null);
    insert into public.cruise_legs (cruise_id, seq, depart_port, depart_lat, depart_lon, depart_at, arrive_port, arrive_lat, arrive_lon, arrive_at, notes)
      values (sailing_id, 0, 'Example departure port', sample.latitude, sample.longitude, sailing_start,
        'Example return port', sample.latitude, sample.longitude, sailing_end, 'Illustrative itinerary; not an operator schedule.')
      on conflict (cruise_id, seq) do nothing;
    insert into public.cruise_stops (cruise_id, seq, kind, name, lat, lon, activity)
      values (sailing_id, 0, 'station', 'Example sampling station', sample.latitude - 0.5, sample.longitude - 0.5, 'Illustrative sampling only')
      on conflict (cruise_id, seq) do nothing;
  end loop;

  insert into public.projects (title, slug, summary, source, external_id, published_at, area_label, requested_start_earliest, requested_start_latest, requested_science_days, party_size, dates_notes)
    values ('Example: Mapping a kelp forest recovery', 'demo-kelp',
      'A fictional proposed study using repeat coastal surveys to explore kelp habitat recovery. This example shows how a team could describe its research needs; it is not a funding or vessel request.',
      'demo', 'kelp', now(), 'California coast', current_date + 90, current_date + 120, 5, 4, 'Illustrative dates only; this project is not accepting bids.')
    on conflict (source, external_id) where external_id is not null do nothing;
end
$$;

commit;
