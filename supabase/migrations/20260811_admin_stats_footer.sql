-- Monthly signup/listing counts for the admin-email stats footer.
-- Read-only aggregate; called via supabaseAdmin.rpc() from lib/admin-notify.ts.
-- Counting notes:
--   * researcher/operator signups = profiles.created_at by CURRENT role. Role
--     mutates (scientist -> operator on claim approval), so a scientist who
--     signed up last month and was approved this month counts as an operator
--     signup for last month. Acceptable drift at current volume.
--   * admins excluded from signup counts.
--   * vessels_listed = vessels.created_at (null = legacy bulk import, never
--     counted), regardless of status — "entered our system this month".
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
  )
  select 'researcher_signups'::text,
         count(*) filter (where p.created_at >= b.cur_start),
         count(*) filter (where p.created_at >= b.prev_start and p.created_at < b.cur_start)
    from profiles p, bounds b where p.role = 'scientist'
  union all
  select 'operator_signups',
         count(*) filter (where p.created_at >= b.cur_start),
         count(*) filter (where p.created_at >= b.prev_start and p.created_at < b.cur_start)
    from profiles p, bounds b where p.role = 'operator'
  union all
  select 'vessels_listed',
         count(*) filter (where v.created_at >= b.cur_start),
         count(*) filter (where v.created_at >= b.prev_start and v.created_at < b.cur_start)
    from vessels v, bounds b;
$$;

-- Server-side only: the footer is built with the service-role client.
revoke execute on function get_signup_stats() from public, anon, authenticated;
