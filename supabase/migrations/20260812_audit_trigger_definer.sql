-- Profile self-edits failed with "new row violates row-level security policy
-- for table data_changes": log_data_changes ran SECURITY INVOKER, so when a
-- user updates their own profiles row from the browser (authenticated role),
-- the audit insert hits data_changes' RLS (no policies = deny) and kills the
-- whole update. Latent since the 2026-08-03 audit work — every other write to
-- an audited table goes through the service role, which bypasses RLS.
--
-- SECURITY DEFINER is the standard shape for audit triggers: the audit row is
-- written with the function owner's rights no matter who caused the change.
alter function log_data_changes() security definer set search_path = public;
