-- Vessel-of-opportunity flag + estimated daily charter rate (2026-07-14)
-- VOO = a pleasure craft / fishing / working vessel that can also host
-- research, as opposed to a dedicated research vessel. Operators set these
-- at onboarding or from the edit form; shown publicly only when filled in.

alter table vessels
  add column if not exists vessel_of_opportunity boolean,
  add column if not exists daily_rate numeric,
  add column if not exists daily_rate_currency text; -- ISO 4217, e.g. 'USD'

alter table vessel_submissions
  add column if not exists vessel_of_opportunity boolean,
  add column if not exists daily_rate numeric,
  add column if not exists daily_rate_currency text;

-- Existing fleet predates the flag and consists of dedicated research
-- vessels — mark them explicitly non-VOO. New vessels answer at onboarding.
update vessels set vessel_of_opportunity = false where vessel_of_opportunity is null;
