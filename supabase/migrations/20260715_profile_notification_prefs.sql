-- Per-user email notification preferences.
-- Opt-out model: a missing key means subscribed; {"new_claim": false} mutes that type.
-- First consumers are admin notifications ('new_claim', 'new_submission'), but any
-- user-level email preference can live here.
alter table profiles
  add column if not exists notification_prefs jsonb not null default '{}';
