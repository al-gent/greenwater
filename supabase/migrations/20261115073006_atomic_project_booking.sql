create unique index project_bids_one_accepted_per_project on public.project_bids (project_id)
  where accepted_at is not null and declined_at is null and withdrawn_at is null;

create function public.save_project_changes(
  p_project_id uuid, p_actor_id uuid, p_updates jsonb,
  p_gear jsonb default null, p_gear_ids jsonb default null, p_people jsonb default null
) returns void language plpgsql security invoker set search_path = public, pg_temp as $$
declare
  current_project public.projects%rowtype;
  next_project public.projects%rowtype;
  item jsonb;
  retained_ids uuid[];
  expected_ids uuid[];
begin
  select * into current_project from public.projects where id = p_project_id and deleted_at is null for update;
  if not found then raise sqlstate 'PT404' using message = 'Project not found'; end if;
  if p_actor_id is null or (current_project.created_by is distinct from p_actor_id
    and not exists (select 1 from public.profiles where id = p_actor_id and is_admin)) then
    raise sqlstate 'PT403' using message = 'Forbidden';
  end if;
  if current_project.source = 'demo' then raise sqlstate 'PT409' using message = 'Example projects are read-only'; end if;
  next_project := jsonb_populate_record(current_project, p_updates);
  if current_project.cruise_id is not null and next_project.published_at is null and p_updates ? 'published_at' then
    raise sqlstate 'PT409' using message = 'A scheduled project cannot go back to draft';
  end if;
  update public.projects set
    title = next_project.title, summary = next_project.summary,
    area_label = next_project.area_label, area_geojson = next_project.area_geojson,
    requested_start_earliest = next_project.requested_start_earliest,
    requested_start_latest = next_project.requested_start_latest,
    requested_science_days = next_project.requested_science_days,
    dates_notes = next_project.dates_notes, party_size = next_project.party_size,
    funding_source = next_project.funding_source, funding_status = next_project.funding_status,
    grant_number = next_project.grant_number, funding_notes = next_project.funding_notes,
    published_at = next_project.published_at
  where id = p_project_id;

  if p_gear is not null then
    if jsonb_typeof(p_gear) <> 'array' or jsonb_array_length(p_gear) > 50 then
      raise sqlstate 'PT400' using message = 'Invalid gear list';
    end if;
    if p_gear_ids is null or jsonb_typeof(p_gear_ids) <> 'array' then
      raise sqlstate 'PT409' using message = 'Reload the project before saving its gear';
    end if;
    select coalesce(array_agg(value::uuid order by value::uuid), '{}'::uuid[]) into expected_ids
      from jsonb_array_elements_text(p_gear_ids);
    if expected_ids is distinct from (select coalesce(array_agg(id order by id), '{}'::uuid[]) from public.project_gear where project_id = p_project_id) then
      raise sqlstate 'PT409' using message = 'The gear list changed. Reload before saving.';
    end if;
    select coalesce(array_agg((value->>'id')::uuid), '{}'::uuid[]) into retained_ids
      from jsonb_array_elements(p_gear) where value->>'id' is not null;
    if cardinality(retained_ids) <> (select count(distinct gear_id) from unnest(retained_ids) gear_id)
      or exists (select 1 from unnest(retained_ids) retained(gear_id) where not exists (
        select 1 from public.project_gear where id = retained.gear_id and project_id = p_project_id
      )) then raise sqlstate 'PT400' using message = 'Invalid or duplicate gear ID'; end if;
    for item in select value from jsonb_array_elements(p_gear) loop
      if item->>'id' is null then
        insert into public.project_gear (project_id, label, equipment_type_id, quantity, notes)
          values (p_project_id, trim(item->>'label'), (item->>'equipment_type_id')::uuid, (item->>'quantity')::integer, item->>'notes');
      else
        update public.project_gear set label = trim(item->>'label'), equipment_type_id = (item->>'equipment_type_id')::uuid,
          quantity = (item->>'quantity')::integer, notes = item->>'notes'
          where id = (item->>'id')::uuid and project_id = p_project_id;
      end if;
    end loop;
    delete from public.project_gear where project_id = p_project_id and id = any(expected_ids) and not (id = any(retained_ids));
  end if;

  if p_people is not null then
    if jsonb_typeof(p_people) <> 'array' or jsonb_array_length(p_people) > 100 then
      raise sqlstate 'PT400' using message = 'Invalid people list';
    end if;
    select coalesce(array_agg((value->>'id')::uuid), '{}'::uuid[]) into retained_ids
      from jsonb_array_elements(p_people) where value->>'id' is not null;
    if cardinality(retained_ids) <> (select count(distinct person_id) from unnest(retained_ids) person_id)
      or exists (select 1 from unnest(retained_ids) retained(person_id) where not exists (
        select 1 from public.project_people where id = retained.person_id and project_id = p_project_id
      )) then raise sqlstate 'PT400' using message = 'Invalid or duplicate project person ID'; end if;
    delete from public.project_people where project_id = p_project_id and not (id = any(retained_ids));
    for item in select value from jsonb_array_elements(p_people) loop
      if item->>'id' is null then
        insert into public.project_people (project_id, role_id, name, notes)
          values (p_project_id, (item->>'role_id')::uuid, trim(item->>'name'), item->>'notes');
      else
        update public.project_people set role_id = (item->>'role_id')::uuid, name = trim(item->>'name'), notes = item->>'notes'
          where id = (item->>'id')::uuid and project_id = p_project_id;
      end if;
    end loop;
  end if;
end;
$$;
revoke all on function public.save_project_changes(uuid, uuid, jsonb, jsonb, jsonb, jsonb) from public, anon, authenticated;
grant execute on function public.save_project_changes(uuid, uuid, jsonb, jsonb, jsonb, jsonb) to service_role;

create function public.transition_project_bid(
  p_project_id uuid, p_bid_id uuid, p_actor_id uuid, p_action text,
  p_updates jsonb default '{}'::jsonb, p_gear jsonb default null
) returns jsonb language plpgsql security invoker set search_path = public, pg_temp as $$
declare
  current_project public.projects%rowtype;
  current_bid public.project_bids%rowtype;
  next_bid public.project_bids%rowtype;
  booked_cruise public.cruises%rowtype;
  declined_ids jsonb := '[]'::jsonb;
  window_end timestamptz;
  actor_admin boolean;
begin
  select * into current_project from public.projects where id = p_project_id and deleted_at is null for update;
  if not found then raise sqlstate 'PT404' using message = 'Project not found'; end if;
  select * into current_bid from public.project_bids where id = p_bid_id and project_id = p_project_id for update;
  if not found then raise sqlstate 'PT404' using message = 'Bid not found'; end if;
  if current_project.source = 'demo' then raise sqlstate 'PT409' using message = 'Example projects do not accept bids'; end if;
  actor_admin := exists (select 1 from public.profiles where id = p_actor_id and is_admin);
  if p_actor_id is null then raise sqlstate 'PT403' using message = 'Forbidden'; end if;
  if p_action in ('confirm', 'update', 'withdraw') then
    if not actor_admin and not exists (
      select 1 from public.vessel_operators where vessel_id = current_bid.vessel_id and user_id = p_actor_id and status = 'active'
    ) then raise sqlstate 'PT403' using message = 'Forbidden'; end if;
  elsif p_action in ('accept', 'decline') then
    if not actor_admin and current_project.created_by is distinct from p_actor_id then
      raise sqlstate 'PT403' using message = 'Forbidden';
    end if;
  else raise sqlstate 'PT400' using message = 'Unknown bid action';
  end if;

  if p_action = 'confirm' and current_bid.confirmed_at is not null then
    select * into booked_cruise from public.cruises where id = current_bid.cruise_id;
    if not found or current_project.cruise_id is distinct from current_bid.cruise_id then
      raise sqlstate 'PT409' using message = 'Booking links need repair before confirmation';
    end if;
    return jsonb_build_object('changed', false, 'cruise_id', booked_cruise.id, 'cruise_slug', booked_cruise.slug);
  end if;
  if p_action = 'accept' and current_bid.accepted_at is not null and current_bid.declined_at is null and current_bid.withdrawn_at is null then
    return jsonb_build_object('changed', false);
  end if;
  if (p_action = 'decline' and current_bid.declined_at is not null)
    or (p_action = 'withdraw' and current_bid.withdrawn_at is not null) then
    return jsonb_build_object('changed', false);
  end if;
  if current_bid.confirmed_at is not null or current_bid.declined_at is not null or current_bid.withdrawn_at is not null
    or current_project.cruise_id is not null then
    raise sqlstate 'PT409' using message = 'This bid is no longer open for that action';
  end if;

  if p_action = 'accept' then
    if exists (select 1 from public.project_bids where project_id = p_project_id and accepted_at is not null and declined_at is null and withdrawn_at is null) then
      raise sqlstate 'PT409' using message = 'Another bid is already accepted';
    end if;
    update public.project_bids set accepted_at = now(), accepted_by = p_actor_id where id = p_bid_id;
    with declined as (
      update public.project_bids set declined_at = now(), declined_by = p_actor_id
      where project_id = p_project_id and id <> p_bid_id and accepted_at is null
        and declined_at is null and withdrawn_at is null and confirmed_at is null returning id
    ) select coalesce(jsonb_agg(id), '[]'::jsonb) into declined_ids from declined;
    return jsonb_build_object('changed', true, 'declined_ids', declined_ids);
  elsif p_action = 'decline' then
    update public.project_bids set declined_at = now(), declined_by = p_actor_id where id = p_bid_id;
  elsif p_action = 'withdraw' then
    update public.project_bids set withdrawn_at = now(), withdrawn_by = p_actor_id where id = p_bid_id;
  elsif p_action = 'update' then
    if current_bid.accepted_at is not null then raise sqlstate 'PT409' using message = 'An accepted bid is frozen'; end if;
    next_bid := jsonb_populate_record(current_bid, p_updates);
    update public.project_bids set proposed_departure_at = next_bid.proposed_departure_at,
      proposed_arrival_at = next_bid.proposed_arrival_at, tz = next_bid.tz, berths = next_bid.berths,
      cost_amount = next_bid.cost_amount, cost_currency = next_bid.cost_currency, notes = next_bid.notes where id = p_bid_id;
    if p_gear is not null then
      if jsonb_typeof(p_gear) <> 'array' or jsonb_array_length(p_gear) > 100 then
        raise sqlstate 'PT400' using message = 'Invalid gear answers';
      end if;
      if exists (select 1 from jsonb_array_elements(p_gear) item where not exists (
        select 1 from public.project_gear where id = (item->>'project_gear_id')::uuid and project_id = p_project_id
      )) then raise sqlstate 'PT400' using message = 'Gear does not belong to this project'; end if;
      delete from public.bid_gear where bid_id = p_bid_id;
      insert into public.bid_gear (project_id, bid_id, project_gear_id, answer, notes)
        select p_project_id, p_bid_id, (value->>'project_gear_id')::uuid, value->>'answer', value->>'notes'
        from jsonb_array_elements(p_gear);
    end if;
  elsif p_action = 'confirm' then
    if current_bid.accepted_at is null then raise sqlstate 'PT409' using message = 'Only an accepted bid can be confirmed'; end if;
    perform id from public.vessels where id = current_bid.vessel_id for no key update;
    perform person.id from public.people person where person.id in (
      select member.person_id from public.project_people member where member.project_id = p_project_id and member.person_id is not null
    ) order by person.id for no key update;
    window_end := greatest(current_bid.proposed_arrival_at, current_bid.proposed_departure_at + interval '24 hours');
    if exists (
      select 1 from public.timeline_entries entry
      left join public.cruises cruise on cruise.id = entry.cruise_id
      left join public.people person on person.id = entry.person_id
      where entry.deleted_at is null and entry.start_at < window_end and entry.end_at > current_bid.proposed_departure_at
        and (entry.vessel_id = current_bid.vessel_id or entry.person_id in (
          select person_id from public.project_people where project_id = p_project_id and person_id is not null
        ))
        and entry.source <> 'demo' and coalesce(cruise.source, '') <> 'demo' and coalesce(person.source, '') <> 'demo'
        and public.data_source_is_visible(entry.source) and public.data_source_is_visible(cruise.source) and public.data_source_is_visible(person.source)
    ) then raise sqlstate 'PT409' using message = 'The vessel or a researcher is no longer free on those dates'; end if;
    insert into public.cruises (vessel_id, organization_id, created_by, title, operating_area_geojson, operating_area,
      departure_at, arrival_at, science_party_size, berths_total, source, published_at, confirmed_at, confirmed_by)
    values (current_bid.vessel_id, (select organization_id from public.vessels where id = current_bid.vessel_id),
      p_actor_id, current_project.title, current_project.area_geojson, current_project.area_label,
      current_bid.proposed_departure_at, current_bid.proposed_arrival_at, current_project.party_size, current_bid.berths,
      'vesselconnect', now(), now(), p_actor_id) returning * into booked_cruise;
    update public.projects set cruise_id = booked_cruise.id where id = p_project_id;
    update public.project_bids set confirmed_at = now(), confirmed_by = p_actor_id, cruise_id = booked_cruise.id where id = p_bid_id;
    insert into public.timeline_entries (vessel_id, start_at, end_at, cruise_id, source, visibility, created_by)
      values (current_bid.vessel_id, current_bid.proposed_departure_at, window_end, booked_cruise.id, 'vesselconnect', 'public', p_actor_id);
    insert into public.timeline_entries (person_id, start_at, end_at, cruise_id, project_person_id, source, visibility)
      select member.person_id, current_bid.proposed_departure_at, window_end, booked_cruise.id, member.id, 'vesselconnect', 'operators'
      from public.project_people member where member.project_id = p_project_id and member.person_id is not null order by member.person_id, member.id;
    return jsonb_build_object('changed', true, 'cruise_id', booked_cruise.id, 'cruise_slug', booked_cruise.slug);
  end if;
  return jsonb_build_object('changed', true);
end;
$$;
revoke all on function public.transition_project_bid(uuid, uuid, uuid, text, jsonb, jsonb) from public, anon, authenticated;
grant execute on function public.transition_project_bid(uuid, uuid, uuid, text, jsonb, jsonb) to service_role;
