# Research data publication hold

MFP imports are preserved in place, not deleted or copied over. The publication migration adds a restrictive SELECT gate for anonymous and authenticated clients, covering imported cruises, projects, people, inventory, organizations, timeline entries and related detail rows. The equipment-location view also respects the caller's RLS. Service-role access remains available for administration and imports.

Existing IDs, raw project payloads, source tags, publication timestamps and relationships remain intact. Importers can continue storing MFP records without making them public. Shared generic dictionaries (equipment types, roles and credentials) and independently sourced vessel profiles remain available.

The narrowly scoped `cruise_source_is_visible(uuid)` security-definer helper returns only a publication boolean, with an empty search path. It checks a parent cruise's source without imposing its public/draft read rules on unrelated operator projects or private timelines; existing permissive policies still decide access to those records.

## Deployment status — November 14, 2026

Applied the publication migration and demo seed to production Supabase project `jmpxcsihkmyotidxjuyv` with explicit approval. Staging uses this same database; the visibility change therefore affects both environments. The updated frontend is deployed to `https://stage.vesselconnect.org` (Vercel preview deployment `dpl_CTqCs773fDMx1WTPAbcgHNz6Ywug`); the production frontend was not redeployed.

The migration and seed committed in one transaction with a five-second lock timeout. Before committing, row-hash comparisons verified that every pre-existing row in all 17 checked research/vessel tables remained identical. Anonymous and authenticated-role visibility assertions also passed inside the transaction. No existing records were deleted or overwritten.

Recovery files are saved locally under the ignored, access-restricted `data/backups/research-publication-20261114/` directory: `research-before.dump` contains the affected tables and vessel records; `schema-before.sql` captures the public schema. This is a scoped recovery backup, not a full database backup. The applied SQL and verification receipt are saved alongside them. The database had no `supabase_migrations.schema_migrations` table, so no migration-history entry was fabricated.

Verified through the hosted Data API: all 1,434 MFP cruises, 1,723 projects, 597 people, 1,013 equipment records and 5,723 timeline entries remain accessible to the service role, while public reads return zero MFP rows. Three demo cruises and four demo projects are public. The new preview returns 200 for the research tabs, timeline and example detail pages, and 404 for sampled old MFP detail URLs. All 22 focused tests, the isolated PostgreSQL integration tests and the Vercel local production build passed. Security advisors reported no findings on the new publication objects; existing search-path and public-extension warnings remain unrelated to this change.

Do not rerun the one-time migration unchanged: its objects now exist. The seed remains repeatable. Do not run the repository's smoke test for this task: it writes to the database in `.env.local`.

## Apply when ready

1. Take the normal database backup and confirm the target connection.
2. Apply `supabase/migrations/20261114_research_publication.sql` through the established migration process.
3. Run `psql "$TARGET_DATABASE_URL" -X -v ON_ERROR_STOP=1 -f scripts/seed_demo_research.sql` against that same explicitly selected database.
4. Deploy the accompanying app changes. Clear any previously cached timeline API responses at the deployment/CDN boundary; old responses may otherwise live for up to six minutes under the existing cache policy. Already downloaded content cannot be recalled.
5. Verify anonymous and ordinary authenticated reads of MFP records return no rows, including direct Data API requests and old detail URLs. Check `/research` (upcoming, proposed, past and timeline), demo cruise/project links, and vessel research cards. Examples must show their labels and have no booking/bidding action.

The seed is transactional and repeatable. It adds three fictional cruises (two upcoming, one past), four projects (including one proposed), fictional researchers, gear requirements, itinerary legs, sampling stops and timeline entries. Dates are relative to the first seed date; rerunning does not move existing examples. It links to existing active vessels named **Atlantis**, **Roger Revelle** and **Sikuliaq** without changing those vessels. If any is absent, the entire seed aborts. The real vessels do not endorse these fictional projects.

Examples use `source = 'demo'`, reserved `demo-*` slugs, and explicit Example labels. They do not accept bids, prefill operator messages, advertise vacant berths or participate in real scheduling conflicts. Their dates are not real vessel availability. No real researchers, email addresses or imported MFP descriptions are used in the seed.

## Resume MFP publication after approval

Run as the database owner/service role in one transaction:

```sql
begin;
update public.data_publication set enabled = true where source_group = 'mfp';
update public.data_publication set enabled = false where source_group = 'demo';
commit;
```

This restores the existing access rules for MFP records (including their original published/draft state) and hides examples without deleting either dataset. Reversing the booleans reinstates the hold. Do not drop the restrictive policies or bulk-clear `published_at` to switch modes. Verify publication approval and data quality before enabling MFP; enabling the flag is not permission to publish by itself.

## Test without production access

```sh
PG_BIN=/path/to/postgresql/bin bash scripts/test_research_publication.sh
node --test scripts/research_publication.test.mjs
npx tsc --noEmit --incremental false
```

The database test starts a disposable PostgreSQL 15+ instance on a temporary Unix socket, applies the relevant existing feature migrations and the new gate, then stops/removes that instance. It never reads `.env.local` or connects to Supabase. It verifies anon/authenticated restrictions, direct child reads and the view, settings write denial, retained service-role access, restoration, demo visibility, seed rollback on missing vessels, repeatability, and real entries overlapping demo dates without exclusion-constraint failures.
