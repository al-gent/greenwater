-- New-signup webhook: POST to the app the moment a profiles row is created
-- (signup time — the handle_new_user trigger runs before email confirmation).
-- The endpoint sends the admin new-signup and new-claim emails. It does NOT
-- write the claim — that happens in SQL inside handle_new_user (see
-- 20260812_claim_insert_in_trigger.sql), so it survives a failed delivery.
--
-- Replaces the /auth/callback notification hook, which missed users whose
-- confirmation link opened in a different browser than they signed up in
-- (PKCE exchange fails, user signs in manually, callback code never runs).
--
-- Delivery is pg_net fire-and-forget: if the endpoint is down the email is
-- dropped, which is acceptable — nothing load-bearing rides on it.
--
-- Config lives in app_config rather than in this file, so the URL can be
-- repointed without editing SQL and the secret stays out of the repo.
-- (Database-level GUCs were the first choice but Supabase denies
-- `alter database ... set`.) Set the secret once, out of band:
--   insert into app_config (key, value) values ('webhook_secret', '<SUPABASE_WEBHOOK_SECRET>')
--   on conflict (key) do update set value = excluded.value;

create extension if not exists pg_net;

-- Server-side key/value config. RLS on with no policies: anon/authenticated
-- read nothing; the service role and definer functions are unaffected.
create table if not exists app_config (
  key   text primary key,
  value text not null
);
alter table app_config enable row level security;
revoke all on app_config from public, anon, authenticated;

insert into app_config (key, value)
values ('new_profile_webhook_url', 'https://vesselconnect.org/api/hooks/new-profile')
on conflict (key) do update set value = excluded.value;

create or replace function public.notify_new_profile_webhook()
returns trigger
language plpgsql
security definer
set search_path to 'public'
as $$
  declare
    url    text;
    secret text;
  begin
    select value into url    from app_config where key = 'new_profile_webhook_url';
    select value into secret from app_config where key = 'webhook_secret';

    if coalesce(url, '') = '' or coalesce(secret, '') = '' then
      raise warning 'new-profile webhook unconfigured; skipped for user %', new.id;
      return new;
    end if;

    -- Same envelope shape as a native Supabase Database Webhook.
    perform net.http_post(
      url     := url,
      body    := jsonb_build_object(
        'type', 'INSERT', 'table', 'profiles', 'schema', 'public',
        'record', to_jsonb(new)
      ),
      headers := jsonb_build_object(
        'Content-Type', 'application/json',
        'x-webhook-secret', secret
      )
    );
    return new;
  exception when others then
    -- Email is best-effort; never block the signup transaction.
    raise warning 'new-profile webhook failed for user %: %', new.id, sqlerrm;
    return new;
  end;
$$;

drop trigger if exists profiles_new_user_webhook on public.profiles;

create trigger profiles_new_user_webhook
  after insert on public.profiles
  for each row
  execute function public.notify_new_profile_webhook();
