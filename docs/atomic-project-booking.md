# Project saves and booking transactions

Project saves and booking confirmation address findings 3 and 4 from the November 14 launch review. Staging and production share the database.

On November 21, the duplicate accepted-bid check returned zero projects. A scoped backup of the seven booking tables and the public schema preceded the migration. The shared database now has both service-role-only booking functions and the unique index. MFP publication remains disabled.

## Behavior

- Project saves send existing gear IDs, update retained lines, insert new lines, and delete only explicitly removed lines. Answers to retained gear survive title changes, edits, and accepted bids. Removing a requirement still removes answers to that specific requirement via the existing foreign key; changing a retained requirement keeps its answers.
- The form sends the gear IDs it originally loaded. A stale list or old client without this baseline receives a reload-required conflict instead of replacing someone else's additions or destroying identities.
- Project fields, gear and people save in one transaction. Existing project-person IDs and directory links survive, so their timeline links remain intact. Invalid IDs, foreign keys, or writes roll back the whole save.
- Every bid mutation locks the project first, then the bid. Acceptance and declining competing offers commit together. A partial unique index additionally prevents multiple live accepted bids for a project.
- Confirmation locks the vessel and linked researchers in consistent order, then creates the cruise, both links, and resource reservations in one transaction. Existing timeline exclusion constraints remain the final protection against competing writers. Failure leaves no partial cruise, links or reservations.
- Successful accept/confirm retries are no-ops; confirmation returns the original cruise. Notifications are initiated only for a newly committed transition. This prevents duplicate notifications on ordinary retries, but it is not a durable email outbox; process interruption can still lose email delivery.
- Demo reservations and held MFP data remain excluded from availability checks. Published MFP reservations still block confirmation. The authored-cruise occupancy window retains the existing 24-hour minimum.
- Both new RPCs are security-invoker, executable only by `service_role`, with explicit author/admin or active-operator checks using the server-authenticated actor. No public RLS policies were changed.

## Validation

```sh
node --test scripts/project_booking.test.mjs scripts/vessel_projects.test.mjs scripts/research_publication.test.mjs scripts/gfw_sync.test.mjs
PG_BIN=/opt/homebrew/opt/postgresql@16/bin bash scripts/test_project_booking.sh
PG_BIN=/opt/homebrew/opt/postgresql@16/bin bash scripts/test_research_publication.sh
npx tsc --noEmit --incremental false
```

The booking database harness creates and removes a disposable PostgreSQL instance using a temporary Unix socket, with TCP disabled. It does not read application environment files or contact the shared database. It exercises failed project/bid/timeline writes, existing gear answers, foreign IDs, stale saves, accepted-term immutability, authorization, publication flags, concurrent acceptance, repeated confirmation, competing vessel/researcher bookings, and cancellation races.

Validation passed: 43 focused Node tests, six concurrent database tests, SQL rollback/authorization assertions, the existing publication database suite, TypeScript, and the production-mode Preview build. Supabase CLI 2.95.4's advisor command misparsed the disposable Unix-socket database URL and could not run; explicit RPC privilege tests passed. No advisor checks or writes were attempted against the shared database.

## Rollout

1. Obtain approval for the shared-database rollout. Back up the relevant tables/schema and inspect existing active accepted bids with the read-only query below. Do not automatically decline or delete duplicates: resolve any existing inconsistencies deliberately.
2. Apply `supabase/migrations/20261115073006_atomic_project_booking.sql` in a single transaction. It only adds functions and an index; it does not rewrite or delete stored records. Duplicate accepted bids make index creation fail rather than silently alter them.
3. Deploy the matching application routes and form to staging after the migration. Do not deploy the new routes without their RPCs. Reload older open project forms before saving.
4. Review with agreed synthetic accounts/data before production frontend promotion. This local validation does not send real mail or perform a live authenticated two-account flow.

```sql
begin read only;
select project_id, array_agg(id order by id) as accepted_bid_ids
from public.project_bids
where accepted_at is not null and declined_at is null and withdrawn_at is null
group by project_id
having count(*) > 1;
commit;
```

For rollback, prefer reverting application code while leaving the additive RPCs/index in place; reverting code reintroduces the old unsafe write paths. Never remove the index or delete booking records merely to make an old deployment succeed.
