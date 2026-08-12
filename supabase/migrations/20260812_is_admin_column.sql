-- Role → is_admin, step 1 of 2 (additive half; house rule: additive first,
-- deploy, then drop). profiles.role conflated permission tier with vessel
-- relationship; operator-ness now lives in vessel_operators, so all that's
-- left of "role" is one bit: admin or not.
--
-- Step 2 (20260812_drop_role_column.sql) drops role + vessel_id and MUST NOT
-- run until the is_admin code is deployed — production still reads role.

alter table profiles
  add column if not exists is_admin boolean not null default false;

update profiles set is_admin = true where role = 'admin';

-- The stats footer's researcher metric was role-based; count non-admin
-- signups instead. A user who signs up and later operates a vessel appears
-- in both researcher_signups and operator_signups — accepted overlap at
-- current volume (operator_signups stays first-membership-based).
create or replace function get_signup_stats()
returns table (metric text, this_month bigint, last_month bigint)
language sql
stable
security definer
set search_path = public
as $$
  with bounds as (
    select date_trunc('month', now())                     as cur_start,
           date_trunc('month', now()) - interval '1 month' as prev_start
  ),
  first_membership as (
    select user_id, min(created_at) as first_at from vessel_operators group by user_id
  )
  select 'researcher_signups'::text,
         count(*) filter (where p.created_at >= b.cur_start),
         count(*) filter (where p.created_at >= b.prev_start and p.created_at < b.cur_start)
    from profiles p, bounds b where not p.is_admin
  union all
  select 'operator_signups',
         count(*) filter (where f.first_at >= b.cur_start),
         count(*) filter (where f.first_at >= b.prev_start and f.first_at < b.cur_start)
    from first_membership f, bounds b
  union all
  select 'vessels_listed',
         count(*) filter (where v.created_at >= b.cur_start),
         count(*) filter (where v.created_at >= b.prev_start and v.created_at < b.cur_start)
    from vessels v, bounds b;
$$;

-- Storage upload policies: the admin arm keyed on profiles.role.
drop policy if exists "Operators and admins can upload vessel docs" on storage.objects;
create policy "Operators and admins can upload vessel docs"
on storage.objects for insert to authenticated
with check (
  bucket_id = 'vessel-docs'
  and (
    exists (select 1 from vessel_operators where user_id = auth.uid())
    or exists (select 1 from profiles where id = auth.uid() and is_admin)
  )
);

drop policy if exists "Operators and admins can upload vessel photos" on storage.objects;
create policy "Operators and admins can upload vessel photos"
on storage.objects for insert to authenticated
with check (
  bucket_id = 'vessel-photos'
  and (
    exists (select 1 from vessel_operators where user_id = auth.uid())
    or exists (select 1 from profiles where id = auth.uid() and is_admin)
  )
);
