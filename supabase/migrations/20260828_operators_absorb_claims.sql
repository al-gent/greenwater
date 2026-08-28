-- vessel_operators absorbs vessel_claims (claim-friction redesign, 8/28).
--
-- Old model: vessel_claims row (pending) -> admin approves -> vessel_operators
-- row grants access. New model: claiming IS becoming an operator — one table,
-- with a status column as the moderation lever:
--   * claim an unclaimed vessel  -> row with status 'active'  (instant editing)
--   * claim an operated vessel   -> row with status 'pending' (admin activates)
--   * admin review is non-blocking: confirm (confirmed_at), suspend (freeze
--     editing/uploads, reversible), or delete the row outright.
-- Claim-specific context (relationship message, supporting document) moves
-- onto the membership row; everything else vessel_claims held was a copy of
-- profiles/vessels data.
--
-- vessel_claims is NOT dropped here: it stops receiving writes and stays as
-- read-only history. Drop it in a later migration once the new flow has been
-- verified in production for a while (additive-first rule).
--
-- App counterparts in the same change: app/api/vessel-claims (claim insert),
-- app/api/admin/claims (review actions), lib/operators.ts + storage policies +
-- message_unread_count (only status='active' grants ability), handle_new_user
-- (signup-path claims), /api/messages (verified gate removed app-side).

-- ── 1. New columns ───────────────────────────────────────────────────────────
alter table vessel_operators
  add column if not exists id                 uuid not null default gen_random_uuid(),
  add column if not exists status             text not null default 'active',
  add column if not exists claim_message      text,
  add column if not exists claim_document_url text,
  add column if not exists confirmed_at       timestamptz,
  add column if not exists confirmed_by       uuid references profiles(id),
  add column if not exists admin_notes        text;

alter table vessel_operators
  drop constraint if exists vessel_operators_status_check;
alter table vessel_operators
  add constraint vessel_operators_status_check
  check (status in ('active', 'pending', 'suspended'));

-- Stable single-column identity for the admin API and the audit log's
-- record_id (the composite PK stays as-is so existing upserts keep working).
create unique index if not exists idx_vessel_operators_row_id on vessel_operators (id);

-- ── 2. Backfill ──────────────────────────────────────────────────────────────
-- Every existing membership was created by an admin approval: confirmed.
update vessel_operators set confirmed_at = created_at where confirmed_at is null;

-- Carry claim context onto memberships that came from approved claims.
update vessel_operators m
   set claim_message      = c.message,
       claim_document_url = c.document_url
  from vessel_claims c
 where c.user_id = m.user_id
   and c.vessel_id = m.vessel_id
   and c.status = 'approved'
   and m.claim_message is null;

-- Pending claims become memberships under the new rule: active when the
-- vessel has no operator yet, pending otherwise. Newest claim per pair wins.
insert into vessel_operators (user_id, vessel_id, status, claim_message, claim_document_url, created_at)
select distinct on (c.user_id, c.vessel_id)
       c.user_id, c.vessel_id,
       case when exists (select 1 from vessel_operators m2 where m2.vessel_id = c.vessel_id)
            then 'pending' else 'active' end,
       c.message, c.document_url, c.created_at
  from vessel_claims c
 where c.status = 'pending' and c.user_id is not null
 order by c.user_id, c.vessel_id, c.created_at desc
on conflict (user_id, vessel_id) do nothing;

-- ── 3. Moderation actions get the same audit trail as data edits ─────────────
drop trigger if exists vessel_operators_audit on vessel_operators;
create trigger vessel_operators_audit after update on vessel_operators
  for each row execute function log_data_changes();

-- ── 4. Only ACTIVE memberships grant ability ─────────────────────────────────
-- Unread-badge counting: suspended/pending operators don't get operator badges.
create or replace function public.message_unread_count(p_user_id uuid)
returns integer language sql stable as $$
  select
    coalesce((
      select count(*) from messages m
      where m.thread_id = m.id and m.status = 'new' and m.author_id <> p_user_id
        and m.vessel_id in (select vessel_id from vessel_operators
                             where user_id = p_user_id and status = 'active')
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

-- Storage upload rights follow active membership.
drop policy if exists "Operators and admins can upload vessel docs" on storage.objects;
create policy "Operators and admins can upload vessel docs"
on storage.objects for insert to authenticated
with check (
  bucket_id = 'vessel-docs'
  and (
    exists (select 1 from vessel_operators where user_id = auth.uid() and status = 'active')
    or exists (select 1 from profiles where id = auth.uid() and is_admin)
  )
);

drop policy if exists "Operators and admins can upload vessel photos" on storage.objects;
create policy "Operators and admins can upload vessel photos"
on storage.objects for insert to authenticated
with check (
  bucket_id = 'vessel-photos'
  and (
    exists (select 1 from vessel_operators where user_id = auth.uid() and status = 'active')
    or exists (select 1 from profiles where id = auth.uid() and is_admin)
  )
);

-- ── 5. Signup-path claims write vessel_operators directly ────────────────────
-- Redefines handle_new_user (supersedes 20260812_gclid_attribution.sql's
-- version; profile insert unchanged — the pending_claim branch now creates
-- the membership itself instead of a vessel_claims row).
create or replace function public.handle_new_user()
returns trigger
language plpgsql
security definer
set search_path to 'public'
as $function$
  declare
    claim      jsonb := new.raw_user_meta_data -> 'pending_claim';
    landing_at timestamptz;
    v_id       int;
  begin
    -- Signup metadata is client-controlled; a malformed timestamp must never
    -- block account creation.
    begin
      landing_at := (new.raw_user_meta_data->>'ad_landing_at')::timestamptz;
    exception when others then
      landing_at := null;
    end;

    insert into public.profiles
      (id, email, first_name, last_name, institution, title, profile_url,
       gclid, wbraid, gbraid, ad_landing_at)
    values (
      new.id,
      new.email,
      new.raw_user_meta_data->>'first_name',
      new.raw_user_meta_data->>'last_name',
      new.raw_user_meta_data->>'institution',
      new.raw_user_meta_data->>'title',
      new.raw_user_meta_data->>'profile_url',
      new.raw_user_meta_data->>'gclid',
      new.raw_user_meta_data->>'wbraid',
      new.raw_user_meta_data->>'gbraid',
      landing_at
    );

    -- Stashed by app/claim/ClaimSignupForm.tsx at signup. First claimant of an
    -- unclaimed vessel becomes an active operator immediately; a vessel that
    -- already has any membership row gets a pending one instead.
    if claim is not null
       and coalesce(claim->>'vessel_id', '')   <> ''
       and coalesce(claim->>'message', '')     <> ''
    then
      begin
        v_id := (claim->>'vessel_id')::int;
        insert into public.vessel_operators (user_id, vessel_id, status, claim_message)
        values (
          new.id,
          v_id,
          case when exists (select 1 from public.vessel_operators where vessel_id = v_id)
               then 'pending' else 'active' end,
          claim->>'message'
        )
        on conflict (user_id, vessel_id) do nothing;
      exception when others then
        -- A malformed claim must never block account creation.
        raise warning 'handle_new_user: membership insert failed for user %: %', new.id, sqlerrm;
      end;
    end if;

    return new;
  end;
  $function$;
