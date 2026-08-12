-- Record which Google Ads click (if any) brought a signup.
--
-- The landing page stores ?gclid= / ?wbraid= / ?gbraid= in localStorage
-- (lib/ad-attribution.ts); the signup form passes it through signUp metadata;
-- this trigger copies it onto the profile row. That makes Postgres the source
-- of truth for ad attribution: offline conversion uploads to Google Ads
-- (immune to ad blockers, counted at whatever quality bar we choose) and the
-- "N signups via ads" stat both read from here. gclid is standard web-search
-- traffic; wbraid/gbraid are Google's iOS variants — at most one is set.
--
-- Must run AFTER 20260812_claim_insert_in_trigger.sql — this redefines
-- handle_new_user and includes that migration's claim logic.

alter table public.profiles
  add column if not exists gclid          text,
  add column if not exists wbraid         text,
  add column if not exists gbraid         text,
  add column if not exists ad_landing_at  timestamptz;

create or replace function public.handle_new_user()
returns trigger
language plpgsql
security definer
set search_path to 'public'
as $function$
  declare
    claim      jsonb := new.raw_user_meta_data -> 'pending_claim';
    full_name  text;
    landing_at timestamptz;
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

    -- Stashed by app/claim/ClaimSignupForm.tsx at signup. Same three-field
    -- guard the old TypeScript path used.
    if claim is not null
       and coalesce(claim->>'vessel_id', '')   <> ''
       and coalesce(claim->>'vessel_name', '') <> ''
       and coalesce(claim->>'message', '')     <> ''
    then
      begin
        full_name := nullif(trim(concat_ws(' ',
          new.raw_user_meta_data->>'first_name',
          new.raw_user_meta_data->>'last_name')), '');

        -- role/organization/claimant_name are NOT NULL; metadata may not have them.
        insert into public.vessel_claims
          (vessel_id, vessel_name, user_id, claimant_name, email, role, organization, message)
        values (
          (claim->>'vessel_id')::int,
          claim->>'vessel_name',
          new.id,
          coalesce(full_name, 'Unknown'),
          coalesce(new.email, ''),
          coalesce(new.raw_user_meta_data->>'title', ''),
          coalesce(new.raw_user_meta_data->>'institution', ''),
          claim->>'message'
        );
      exception when others then
        -- A malformed claim must never block account creation.
        raise warning 'handle_new_user: claim insert failed for user %: %', new.id, sqlerrm;
      end;
    end if;

    return new;
  end;
  $function$;
