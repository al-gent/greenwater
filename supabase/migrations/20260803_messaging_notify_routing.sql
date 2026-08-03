-- Messaging v0 routing (2026-08-03).
-- 1) Drop the unused authenticated-insert RLS policy: every legitimate write
--    goes through the API (service role); the policy only enabled forged
--    direct inserts (incl. author_role='operator' into others' threads).
-- 2) Inquiry-notification bookkeeping on thread roots: how the vessel side
--    was notified, where the email went, and what Brevo said happened to it.

drop policy if exists "authenticated_insert" on messages;

alter table messages
  add column if not exists notified_via text,      -- 'operator' | 'vessel_email' | 'unrouted' (root rows only)
  add column if not exists notified_email text,    -- address the inquiry email went to
  add column if not exists delivery_status text;   -- 'sent' → webhook: 'delivered' | 'bounced' | 'blocked' | 'spam'
