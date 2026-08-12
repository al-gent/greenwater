-- Membership-based read paths (VESSEL_OPERATORS_PLAN.md Phases 1-2, DB side).
-- Rewrites the two functions that still keyed operator-ness off
-- profiles.role/vessel_id, and fixes backfill timestamps.

-- 1. Backfilled membership rows carried created_at = backfill time, which
--    would make the stats footer count all 13 as August signups. Restore
--    history: the claim's approval date, else the profile's creation date.
update vessel_operators vo
set created_at = coalesce(
  (select min(c.reviewed_at) from vessel_claims c
    where c.user_id = vo.user_id and c.vessel_id = vo.vessel_id and c.status = 'approved'),
  (select p.created_at from profiles p where p.id = vo.user_id),
  vo.created_at
)
where vo.created_at >= '2026-08-12';

-- 2. Unread badge: a user can now be an operator AND an inquirer, so count
--    both sides. Operator side: 'new' threads on any operated vessel (own
--    threads excluded — self-inquiries count on the inquirer side only).
create or replace function public.message_unread_count(p_user_id uuid)
returns integer
language sql
stable
as $$
  select
    coalesce((
      select count(*) from messages m
      where m.thread_id = m.id and m.status = 'new' and m.author_id <> p_user_id
        and m.vessel_id in (select vessel_id from vessel_operators where user_id = p_user_id)
    ), 0)::int
    +
    coalesce((
      select count(*) from messages root
      where root.author_id = p_user_id and root.thread_id = root.id
        and exists (
          select 1 from messages m2
          where m2.thread_id = root.id and m2.author_role = 'operator'
            and m2.created_at > coalesce(root.scientist_read_at, '-infinity'::timestamptz)
        )
    ), 0)::int
$$;

-- 3. Stats footer: operator signups = users whose FIRST vessel membership
--    landed in the month (role='operator' stops being written). researcher
--    count keeps its role filter; after the Phase 6 role collapse an operator
--    may also appear there — acceptable double-count at current volume.
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
    from profiles p, bounds b where p.role = 'scientist'
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
