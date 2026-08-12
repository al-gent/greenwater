-- File the pending vessel claim in SQL, at signup, in the same transaction as
-- the profile row.
--
-- Previously /api/hooks/new-profile did this insert over HTTP, reached via a
-- database webhook. pg_net is fire-and-forget: if the endpoint was down, had a
-- stale secret, or timed out, the claim was silently lost — the operator saw
-- "check your email" and nothing was ever filed. The claim needs no network
-- access (pending_claim is already in raw_user_meta_data), so it belongs here.
--
-- The webhook still runs, but only sends the admin emails, which genuinely do
-- need the app server (Brevo API key + templates) and are allowed to be lossy.
--
-- Trigger timing is unchanged: on_auth_user_created is AFTER INSERT on
-- auth.users, so the row exists and vessel_claims.user_id -> auth.users(id)
-- resolves.

create or replace function public.handle_new_user()
returns trigger
language plpgsql
security definer
set search_path to 'public'
as $function$
  declare
    claim     jsonb := new.raw_user_meta_data -> 'pending_claim';
    full_name text;
  begin
    insert into public.profiles (id, email, first_name, last_name, institution, title, profile_url)
    values (
      new.id,
      new.email,
      new.raw_user_meta_data->>'first_name',
      new.raw_user_meta_data->>'last_name',
      new.raw_user_meta_data->>'institution',
      new.raw_user_meta_data->>'title',
      new.raw_user_meta_data->>'profile_url'
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
