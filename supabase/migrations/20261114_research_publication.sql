create table public.data_publication (
  source_group text primary key check (source_group in ('mfp', 'demo')),
  enabled boolean not null default false
);

insert into public.data_publication (source_group, enabled) values ('mfp', false), ('demo', true);
alter table public.data_publication enable row level security;
revoke all on public.data_publication from anon, authenticated;
grant select on public.data_publication to anon, authenticated;
grant all on public.data_publication to service_role;
create policy data_publication_read on public.data_publication for select to anon, authenticated using (true);

create function public.data_source_is_visible(data_source text) returns boolean
language sql stable security invoker set search_path = '' as $$
  select case
    when data_source like 'unols\_mfp%' escape '\' then
      coalesce((select enabled from public.data_publication where source_group = 'mfp'), false)
    when data_source = 'demo' then
      coalesce((select enabled from public.data_publication where source_group = 'demo'), false)
    else true
  end
$$;
revoke all on function public.data_source_is_visible(text) from public;
grant execute on function public.data_source_is_visible(text) to anon, authenticated, service_role;

create function public.cruise_source_is_visible(target_cruise_id uuid) returns boolean
language sql stable security definer set search_path = '' as $$
  select coalesce((select public.data_source_is_visible(source) from public.cruises where id = target_cruise_id), false)
$$;
revoke all on function public.cruise_source_is_visible(uuid) from public;
grant execute on function public.cruise_source_is_visible(uuid) to anon, authenticated, service_role;

create policy cruises_source_visibility on public.cruises as restrictive for select to anon, authenticated
  using (public.data_source_is_visible(source));
create policy projects_source_visibility on public.projects as restrictive for select to anon, authenticated
  using (public.data_source_is_visible(source)
    and (cruise_id is null or public.cruise_source_is_visible(cruise_id)));
create policy people_source_visibility on public.people as restrictive for select to anon, authenticated
  using (public.data_source_is_visible(source));
create policy equipment_source_visibility on public.equipment as restrictive for select to anon, authenticated
  using (public.data_source_is_visible(source));
create policy organizations_source_visibility on public.organizations as restrictive for select to anon, authenticated
  using (mfp_organisation_id is null or public.data_source_is_visible('unols_mfp'));

create policy timeline_source_visibility on public.timeline_entries as restrictive for select to anon, authenticated
  using (public.data_source_is_visible(source)
    and (cruise_id is null or public.cruise_source_is_visible(cruise_id))
    and (person_id is null or exists (select 1 from public.people where id = timeline_entries.person_id))
    and (equipment_id is null or exists (select 1 from public.equipment where id = timeline_entries.equipment_id)));
create policy cruise_people_source_visibility on public.cruise_people as restrictive for select to anon, authenticated
  using (public.data_source_is_visible(source)
    and exists (select 1 from public.cruises where id = cruise_people.cruise_id)
    and (person_id is null or exists (select 1 from public.people where id = cruise_people.person_id)));
create policy cruise_equipment_source_visibility on public.cruise_equipment as restrictive for select to anon, authenticated
  using (public.data_source_is_visible(source)
    and exists (select 1 from public.cruises where id = cruise_equipment.cruise_id)
    and (equipment_id is null or exists (select 1 from public.equipment where id = cruise_equipment.equipment_id)));
create policy equipment_locations_source_visibility on public.equipment_locations as restrictive for select to anon, authenticated
  using (exists (select 1 from public.equipment where id = equipment_locations.equipment_id));
create policy people_credentials_source_visibility on public.people_credentials as restrictive for select to anon, authenticated
  using (exists (select 1 from public.people where id = people_credentials.person_id));
create policy project_people_source_visibility on public.project_people as restrictive for select to anon, authenticated
  using (exists (select 1 from public.projects where id = project_people.project_id)
    and (person_id is null or exists (select 1 from public.people where id = project_people.person_id)));
create policy project_gear_source_visibility on public.project_gear as restrictive for select to anon, authenticated
  using (exists (select 1 from public.projects where id = project_gear.project_id));
create policy project_bids_source_visibility on public.project_bids as restrictive for select to anon, authenticated
  using (exists (select 1 from public.projects where id = project_bids.project_id));

alter view public.equipment_current_location set (security_invoker = true);

alter table public.cruises drop constraint cruises_source_check;
alter table public.cruises add constraint cruises_source_check check (source in ('vesselconnect', 'unols_mfp', 'demo'));
alter table public.projects drop constraint projects_source_check;
alter table public.projects add constraint projects_source_check check (source in ('vesselconnect', 'unols_mfp', 'demo'));
