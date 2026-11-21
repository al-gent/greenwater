-- Vessel roles describe real-world associations. Platform permissions live in vessel_operators.
create table public.vessel_people (
  id uuid primary key default gen_random_uuid(),
  vessel_id integer not null references public.vessels(id) on delete cascade,
  person_id uuid not null references public.people(id),
  role text not null check (role = trim(role) and length(role) between 1 and 100),
  starts_on date,
  ends_on date,
  check (ends_on >= starts_on),
  exclude using gist (vessel_id with =, person_id with =, lower(role) with =, daterange(starts_on, ends_on, '[]') with &&)
);
create index vessel_people_person_idx on public.vessel_people(person_id);
create index vessel_people_vessel_idx on public.vessel_people(vessel_id);
alter table public.vessel_people enable row level security;
revoke all on public.vessel_people from public, anon, authenticated;
grant select on public.vessel_people to authenticated;
grant all on public.vessel_people to service_role;
create policy vessel_people_managers_read on public.vessel_people for select to authenticated using (
  exists (select from public.people p where p.id = vessel_people.person_id) and (
    exists (select from public.vessel_operators vo where vo.vessel_id = vessel_people.vessel_id and vo.user_id = (select auth.uid()) and vo.status = 'active')
    or exists (select from public.profiles p where p.id = (select auth.uid()) and p.is_admin)
  )
);

-- Resolve only an explicitly selected directory entry or an explicit request to add one.
-- Same-name people may be distinct; name-only project entries are still supported.
create function public.resolve_planning_person(p_choice jsonb, p_actor uuid) returns public.people
language plpgsql security invoker set search_path = '' as $$
declare selected public.people;
begin
  if p_choice->>'person_id' is not null then
    select * into selected from public.people where id = (p_choice->>'person_id')::uuid
      and source <> 'demo' and public.data_source_is_visible(source);
    if not found then raise sqlstate 'PT400' using message = 'Choose an available directory person'; end if;
  elsif p_choice->'create_person' = 'true'::jsonb then
    if coalesce(length(trim(p_choice->>'name')), 0) not between 1 and 200 then
      raise sqlstate 'PT400' using message = 'Enter a name of up to 200 characters';
    end if;
    insert into public.people(name, created_by) values (trim(p_choice->>'name'), p_actor) returning * into selected;
  end if;
  return selected;
end $$;
revoke all on function public.resolve_planning_person(jsonb,uuid) from public, anon, authenticated;
grant execute on function public.resolve_planning_person(jsonb,uuid) to service_role;

create or replace function public.save_project_changes(
  p_project_id uuid, p_actor_id uuid, p_updates jsonb,
  p_gear jsonb default null, p_gear_ids jsonb default null, p_people jsonb default null
) returns void language plpgsql security invoker set search_path = public, pg_temp as $$
declare
  current_project public.projects%rowtype;
  next_project public.projects%rowtype;
  item jsonb;
  chosen public.people;
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
    if current_project.cruise_id is not null and (
      exists (select from public.project_people pp where pp.project_id = p_project_id and pp.person_id is not null and not (pp.id = any(retained_ids)))
      or exists (select from jsonb_array_elements(p_people) e left join public.project_people pp on pp.id = (e->>'id')::uuid
                 where e->'create_person' = 'true'::jsonb or (e ? 'person_id' and (e->>'person_id')::uuid is distinct from pp.person_id))
    ) then raise sqlstate 'PT409' using message = 'The linked people are already reserved for this cruise'; end if;
    delete from public.project_people where project_id = p_project_id and not (id = any(retained_ids));
    for item in select value from jsonb_array_elements(p_people) loop
      chosen := public.resolve_planning_person(item, p_actor_id);
      if item->>'id' is null then
        insert into public.project_people (project_id, role_id, person_id, name, notes)
          values (p_project_id, (item->>'role_id')::uuid, chosen.id, coalesce(chosen.name, trim(item->>'name')), item->>'notes');
      else
        update public.project_people set role_id = (item->>'role_id')::uuid,
          person_id = case when item ? 'person_id' or chosen.id is not null then chosen.id else person_id end,
          name = coalesce(chosen.name, trim(item->>'name')), notes = item->>'notes'
          where id = (item->>'id')::uuid and project_id = p_project_id;
      end if;
    end loop;
  end if;
end;
$$;
revoke all on function public.save_project_changes(uuid, uuid, jsonb, jsonb, jsonb, jsonb) from public, anon, authenticated;
grant execute on function public.save_project_changes(uuid, uuid, jsonb, jsonb, jsonb, jsonb) to service_role;

create function public.create_planning_project(p_actor uuid, p_slug text, p_updates jsonb, p_gear jsonb, p_people jsonb)
returns jsonb language plpgsql security invoker set search_path = '' as $$
declare project_id uuid;
begin
  insert into public.projects(title,slug,source,created_by) values (p_updates->>'title',p_slug,'vesselconnect',p_actor) returning id into project_id;
  perform public.save_project_changes(project_id,p_actor,p_updates,p_gear,'[]'::jsonb,p_people);
  return jsonb_build_object('id',project_id,'slug',p_slug);
end $$;
revoke all on function public.create_planning_project(uuid,text,jsonb,jsonb,jsonb) from public, anon, authenticated;
grant execute on function public.create_planning_project(uuid,text,jsonb,jsonb,jsonb) to service_role;

create function public.save_vessel_person(p_actor uuid, p_vessel integer, p_id uuid, p_choice jsonb, p_role text, p_start date, p_end date)
returns uuid language plpgsql security invoker set search_path = '' as $$
declare chosen public.people; saved uuid;
begin
  if not exists (select from public.vessel_operators where vessel_id=p_vessel and user_id=p_actor and status='active')
    and not exists (select from public.profiles where id=p_actor and is_admin) then
    raise sqlstate 'PT403' using message = 'Only vessel managers can edit these roles';
  end if;
  chosen := public.resolve_planning_person(p_choice,p_actor);
  if chosen.id is null then raise sqlstate 'PT400' using message = 'Select or add a directory person'; end if;
  if p_id is null then
    insert into public.vessel_people(vessel_id,person_id,role,starts_on,ends_on) values (p_vessel,chosen.id,trim(p_role),p_start,p_end) returning id into saved;
  else
    update public.vessel_people set person_id=chosen.id, role=trim(p_role), starts_on=p_start, ends_on=p_end
      where id=p_id and vessel_id=p_vessel returning id into saved;
    if not found then raise sqlstate 'PT404' using message = 'Vessel role not found'; end if;
  end if;
  return saved;
end $$;
revoke all on function public.save_vessel_person(uuid,integer,uuid,jsonb,text,date,date) from public, anon, authenticated;
grant execute on function public.save_vessel_person(uuid,integer,uuid,jsonb,text,date,date) to service_role;
