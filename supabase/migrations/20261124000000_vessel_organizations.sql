-- Organizations as the single list of institutions, with aliases and dated vessel links.
-- Additive: vessels.affiliation / operator_name / owner / organization_id stay until the
-- app reads vessel_organizations, then a follow-up migration drops them.

-- Matching key for organization names: case, punctuation, and legal suffixes ignored.
-- "TDI-Brooks International, Inc." and "TDI Brooks International" share one key.
create function public.org_key(p_name text) returns text
language sql immutable strict parallel safe set search_path = '' as $$
  select regexp_replace(
    regexp_replace(lower(p_name), '\m(inc|incorporated|llc|ltd|limited|corp|corporation|co|gmbh|plc|pty)\M\.?', ' ', 'g'),
    '[^[:alnum:]]', '', 'g')
$$;

-- Organization kind describes what it is; its role on a vessel lives on the link.
alter table public.organizations alter column kind set default 'other';
update public.organizations set kind = 'other' where kind = 'operator';
alter table public.organizations
  add constraint organizations_kind_check
    check (kind in ('university','research_institute','government','company','consortium','nonprofit','other')),
  add column parent_id uuid references public.organizations(id) on delete set null,
  add column created_by uuid references public.profiles(id) on delete set null,
  -- Members can add organizations from forms; they go live immediately and admins
  -- review them afterwards. Null = not yet reviewed.
  add column reviewed_at timestamptz,
  add constraint organizations_not_own_parent check (parent_id <> id);
update public.organizations set reviewed_at = now();
create index organizations_parent on public.organizations(parent_id) where parent_id is not null;
create index organizations_review_queue on public.organizations(created_at) where reviewed_at is null;

-- Institutions are public; only the research data behind MFP stays gated (on cruises, people, etc.).
drop policy organizations_source_visibility on public.organizations;

create table public.organization_aliases (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations(id) on delete cascade,
  alias text not null check (alias = trim(alias) and length(alias) between 1 and 300),
  alias_key text generated always as (public.org_key(alias)) stored,
  created_at timestamptz not null default now()
);
-- One spelling resolves to exactly one organization.
create unique index organization_aliases_key on public.organization_aliases(alias_key);
create index organization_aliases_org on public.organization_aliases(organization_id);
alter table public.organization_aliases enable row level security;
create policy organization_aliases_public_read on public.organization_aliases for select using (true);
revoke insert, update, delete on public.organization_aliases from anon, authenticated;

create table public.vessel_organizations (
  id uuid primary key default gen_random_uuid(),
  vessel_id integer not null references public.vessels(id) on delete cascade,
  organization_id uuid not null references public.organizations(id) on delete restrict,
  role text not null check (role in ('owner','operator','affiliation')),
  starts_on date,
  ends_on date,
  created_at timestamptz not null default now(),
  check (ends_on >= starts_on),
  -- The same organization can't hold the same role twice over overlapping dates.
  exclude using gist (vessel_id with =, organization_id with =, role with =, daterange(starts_on, ends_on, '[]') with &&),
  -- At most one owning organization at a time (a private owner is a vessel_people row instead).
  exclude using gist (vessel_id with =, daterange(starts_on, ends_on, '[]') with &&) where (role = 'owner')
);
create index vessel_organizations_vessel on public.vessel_organizations(vessel_id);
create index vessel_organizations_org on public.vessel_organizations(organization_id, role);
alter table public.vessel_organizations enable row level security;
create policy vessel_organizations_public_read on public.vessel_organizations for select using (true);
revoke insert, update, delete on public.vessel_organizations from anon, authenticated;

-- Resolve free text (a form entry, an import) to an existing organization by
-- name, short name, or alias. Returns null when nothing matches.
create function public.resolve_organization(p_text text) returns uuid
language sql stable set search_path = '' as $$
  with k as (select public.org_key(p_text) as key)
  select coalesce(
    (select o.id from public.organizations o, k where public.org_key(o.name) = k.key limit 1),
    (select a.organization_id from public.organization_aliases a, k where a.alias_key = k.key),
    (select o.id from public.organizations o, k where o.short_name is not null and public.org_key(o.short_name) = k.key limit 1)
  )
$$;
create index organizations_org_key on public.organizations(public.org_key(name));
