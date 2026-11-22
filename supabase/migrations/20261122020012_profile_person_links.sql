-- Profile owners can edit their profile. Only trusted server roles may assign admin status.
create function public.protect_profile_admin_flag() returns trigger
language plpgsql security invoker set search_path = '' as $$
begin
  if current_user in ('anon','authenticated') and new.is_admin then
    if tg_op = 'INSERT' or old.is_admin is distinct from new.is_admin then
      raise insufficient_privilege using message = 'Admin status requires a privileged update.';
    end if;
  end if;
  return new;
end $$;
create trigger protect_profile_admin_flag before insert or update of is_admin on public.profiles
  for each row execute function public.protect_profile_admin_flag();

create table public.person_link_requests (
  id uuid primary key default gen_random_uuid(),
  profile_id uuid not null references public.profiles(id) on delete cascade,
  person_id uuid not null references public.people(id) on delete cascade,
  verified_account_email text,
  note text check (length(note) <= 800),
  status text not null default 'pending' check (status in ('pending','confirmed','declined')),
  created_at timestamptz not null default now(),
  reviewed_at timestamptz,
  reviewed_by uuid references public.profiles(id) on delete set null,
  check ((status = 'pending') = (reviewed_at is null))
);
create unique index person_links_pending_member on public.person_link_requests(profile_id) where status = 'pending';
create index person_links_member_history on public.person_link_requests(profile_id, created_at desc);
create index person_links_review_queue on public.person_link_requests(created_at) where status = 'pending';
create index person_links_person on public.person_link_requests(person_id);
alter table public.person_link_requests enable row level security;
revoke all on public.person_link_requests from public, anon, authenticated;
grant select on public.person_link_requests to authenticated;
grant all on public.person_link_requests to service_role;
create policy member_reads_own_link_request on public.person_link_requests for select to authenticated
  using (profile_id = (select auth.uid()));

-- Both writers lock person, then member, then requests in the same order.
create function public.request_person_link(p_member uuid, p_person uuid, p_note text, p_verified_email text) returns uuid
language plpgsql security invoker set search_path = '' as $$
declare
  person public.people%rowtype;
  pending public.person_link_requests%rowtype;
begin
  select * into person from public.people where id = p_person for update;
  if not found or person.source = 'demo' or not public.data_source_is_visible(person.source) then
    raise sqlstate 'PT404' using message = 'This directory record is unavailable.';
  end if;
  perform 1 from public.profiles where id = p_member for update;
  if not found then raise sqlstate 'PT404' using message = 'Member profile unavailable.'; end if;
  if person.profile_id is not null or exists (select from public.people where profile_id = p_member) then
    raise sqlstate 'PT409' using message = 'This record or account already has a confirmed link.';
  end if;
  select * into pending from public.person_link_requests where profile_id = p_member and status = 'pending';
  if found then
    if pending.person_id = p_person then return pending.id; end if;
    raise sqlstate 'PT409' using message = 'You already have a request under review.';
  end if;
  insert into public.person_link_requests(profile_id,person_id,note,verified_account_email) values (p_member,p_person,nullif(trim(p_note),''),p_verified_email) returning id into pending.id;
  return pending.id;
end $$;

create function public.review_person_link(p_admin uuid, p_request uuid, p_status text) returns void
language plpgsql security invoker set search_path = '' as $$
declare
  req public.person_link_requests%rowtype;
  person public.people%rowtype;
begin
  if not exists (select from public.profiles where id = p_admin and is_admin) then
    raise sqlstate 'PT403' using message = 'Admin access required.';
  end if;
  if p_status is null or p_status not in ('confirmed','declined') then raise sqlstate 'PT400' using message = 'Choose a review decision.'; end if;
  select * into req from public.person_link_requests where id = p_request;
  if not found then raise sqlstate 'PT404' using message = 'Request unavailable.'; end if;
  select * into person from public.people where id = req.person_id for update;
  perform 1 from public.profiles where id = req.profile_id for update;
  select * into req from public.person_link_requests where id = p_request for update;
  if not found then raise sqlstate 'PT404' using message = 'Request unavailable.'; end if;
  if req.status = p_status then return; end if;
  if req.status <> 'pending' then raise sqlstate 'PT409' using message = 'This request has already been reviewed.'; end if;
  if p_status = 'confirmed' then
    if person.source = 'demo' or not public.data_source_is_visible(person.source) or person.profile_id is not null
       or exists (select from public.people where profile_id = req.profile_id) then
      raise sqlstate 'PT409' using message = 'This record is no longer available to link.';
    end if;
    update public.people set profile_id = req.profile_id where id = req.person_id;
    update public.person_link_requests set status = 'declined', reviewed_by = p_admin, reviewed_at = now()
      where person_id = req.person_id and status = 'pending' and id <> p_request;
  end if;
  update public.person_link_requests set status = p_status, reviewed_by = p_admin, reviewed_at = now() where id = p_request;
end $$;
revoke all on function public.request_person_link(uuid,uuid,text,text), public.review_person_link(uuid,uuid,text) from public, anon, authenticated;
grant execute on function public.request_person_link(uuid,uuid,text,text), public.review_person_link(uuid,uuid,text) to service_role;

create policy member_reads_own_vessel_roles on public.vessel_people for select to authenticated using (
  person_id = (select id from public.people where profile_id = (select auth.uid()))
);

create index project_people_linked_person on public.project_people(person_id) where person_id is not null;
create index projects_linked_pi on public.projects(pi_person_id) where pi_person_id is not null;

-- Invoker rights keep projects, cruises, and vessel roles subject to the viewer's RLS.
create function public.my_person_work_credits()
returns table(kind text, title text, path text, role text, starts_on date, ends_on date)
language sql stable security invoker set search_path = '' as $$
  with mine as (select id from public.people where profile_id = (select auth.uid()))
  select 'Vessel' as kind, v.name as title, '/vessels/' || v.id as path, a.role, a.starts_on, a.ends_on
    from public.vessel_people a join public.vessels v on v.id = a.vessel_id
    where a.person_id = (select id from mine) and v.status is distinct from 'deleted'
  union all
  select 'Cruise', c.title, '/cruises/' || c.slug, r.label, coalesce(a.start_at,c.departure_at)::date, coalesce(a.end_at,c.arrival_at)::date
    from public.cruise_people a join public.cruises c on c.id = a.cruise_id join public.cruise_roles r on r.id = a.role_id
    where a.person_id = (select id from mine) and a.deleted_at is null and c.published_at is not null and c.source <> 'demo'
  union all
  select 'Project', p.title, '/projects/' || p.slug, roles.label, p.requested_start_earliest, null::date
    from public.projects p join (
      select a.project_id, r.label from public.project_people a join public.cruise_roles r on r.id = a.role_id where a.person_id = (select id from mine)
      union select id, 'Principal investigator' from public.projects where pi_person_id = (select id from mine)
    ) roles on roles.project_id = p.id where p.deleted_at is null and p.source <> 'demo'
  order by starts_on desc nulls last, title, role
$$;
revoke all on function public.my_person_work_credits() from public, anon;
grant execute on function public.my_person_work_credits() to authenticated;
