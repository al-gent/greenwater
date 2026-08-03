-- Unread message badges (2026-08-03).
-- Operator-side unread already lives in the root status machine
-- ('new' → 'read'/'responded', flipped back to 'new' on scientist replies).
-- Scientist-side had nowhere to record "seen the operator's reply":
-- scientist_read_at on the thread root is that marker — any operator message
-- newer than it is unread.

alter table messages add column if not exists scientist_read_at timestamptz;

-- Unread-thread count for the navbar badge, computed in the DB.
create or replace function message_unread_count(p_user_id uuid) returns integer as $$
declare
  prof record;
  n integer := 0;
begin
  select role, vessel_id into prof from profiles where id = p_user_id;

  if prof.role = 'operator' and prof.vessel_id is not null then
    select count(*) into n from messages
    where vessel_id = prof.vessel_id and thread_id = id and status = 'new';
  else
    select count(*) into n from messages root
    where root.author_id = p_user_id and root.thread_id = root.id
      and exists (
        select 1 from messages m
        where m.thread_id = root.id and m.author_role = 'operator'
          and m.created_at > coalesce(root.scientist_read_at, '-infinity'::timestamptz)
      );
  end if;

  return coalesce(n, 0);
end
$$ language plpgsql stable;
