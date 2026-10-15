-- A cruise confirmed from a bid takes its vessel's organization, which independent
-- operators may not have. The vessel is the required link; the organization is derived.
alter table cruises alter column organization_id drop not null;
