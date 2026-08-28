#!/usr/bin/env bash
# Spin up the ephemeral Supabase staging branch and point local dev + the
# Vercel Preview environment at it. Companion: staging-down.sh (the off
# switch — branches bill ~$0.01/hr while they exist, so tear down when done).
#
# What this does:
#   1. Creates branch "staging" on the prod project (full data clone) if it
#      doesn't already exist, and waits until it's healthy.
#   2. Parks prod credentials in .env.prod (first run only), then writes
#      .env.local pointing at the branch — local `npm run dev` talks to
#      staging from then on. (No SUPABASE_DB_URL for staging: the CLI never
#      reveals the branch DB password. Use `sql_staging "select 1"` below /
#      the Management API query endpoint for ad-hoc SQL.)
#   3. Repoints the branch's cloned app_config webhook at the staging
#      deployment, so signup notifications hit the preview site (whose
#      sendEmail chokepoint redirects ALL mail to ADMIN_NOTIFY_DEV_EMAIL)
#      instead of emailing real admins via production.
#   4. Overwrites the Supabase vars in Vercel's Preview environment with the
#      branch's, so the staging deployment uses the branch too.
#
# After it finishes: push (or re-push) the `staging` git branch to build the
# staging deployment with the new env.
set -euo pipefail
cd "$(dirname "$0")/.."

PROD_REF=jmpxcsihkmyotidxjuyv
BRANCH=staging
# Stable domain of the staging git branch's Vercel deployment
# (stage CNAME → cname.vercel-dns.com in Cloudflare, DNS-only;
# fallback alias: greenwater-git-staging-adamgent.vercel.app).
STAGING_SITE="${STAGING_SITE:-https://stage.vesselconnect.org}"
DEV_INBOX="${ADMIN_NOTIFY_DEV_EMAIL:-94gent@gmail.com}"

# Supabase personal access token, as stored by `supabase login` (macOS keychain).
sb_token() {
  security find-generic-password -l "Supabase CLI" -w | sed 's/^go-keyring-base64://' | base64 -d
}
api() { # api <method> <path> [json-body]
  curl -s -X "$1" -H "Authorization: Bearer $(sb_token)" -H "Content-Type: application/json" \
    "https://api.supabase.com/v1$2" ${3:+-d "$3"}
}

# ── 1. Branch exists + healthy ────────────────────────────────────────────────
if ! supabase branches get "$BRANCH" --project-ref "$PROD_REF" >/dev/null 2>&1; then
  echo "Creating branch '$BRANCH' (data clone)…"
  supabase branches create "$BRANCH" --project-ref "$PROD_REF" \
    --persistent --with-data --size micro --yes >/dev/null
fi
BREF=""
echo -n "Waiting for branch to be healthy"
for i in $(seq 1 60); do
  ROW=$(api GET "/projects/$PROD_REF/branches" | python3 -c "
import json,sys
for b in json.load(sys.stdin):
    if b.get('name')=='$BRANCH':
        print(b.get('project_ref',''), b.get('status',''))")
  BREF=$(echo "$ROW" | cut -d' ' -f1)
  STATUS=$(echo "$ROW" | cut -d' ' -f2)
  [ "$STATUS" = "ACTIVE_HEALTHY" ] || [ "$STATUS" = "FUNCTIONS_DEPLOYED" ] && break
  echo -n "."; sleep 15
done
echo " ${STATUS:-unknown}"
{ [ "$STATUS" = "ACTIVE_HEALTHY" ] || [ "$STATUS" = "FUNCTIONS_DEPLOYED" ]; } \
  || { echo "Branch never became healthy — check the Supabase dashboard."; exit 1; }
echo "Branch ref: $BREF"

# SQL on the branch via the Management API (no DB password needed).
sql_staging() {
  api POST "/projects/$BREF/database/query" "$(python3 -c 'import json,sys; print(json.dumps({"query": sys.argv[1]}))' "$1")"
}

# ── 2. Branch credentials (anon JWT + service role are unmasked; DB password
#       and sb_* keys are not, hence the API-based sql_staging above) ─────────
ENVFILE=$(mktemp); trap 'rm -f "$ENVFILE"' EXIT
supabase branches get "$BRANCH" --project-ref "$PROD_REF" -o env > "$ENVFILE"
get() { grep "^$1=" "$ENVFILE" | cut -d= -f2- | tr -d '"'; }
B_URL=$(get SUPABASE_URL)
B_ANON=$(get SUPABASE_ANON_KEY)
B_SVC=$(get SUPABASE_SERVICE_ROLE_KEY)
[ -n "$B_URL" ] && [ -n "$B_ANON" ] && [ -n "$B_SVC" ] || { echo "Missing branch credentials"; exit 1; }

# ── 3. Local env: park prod once, write staging .env.local ───────────────────
if [ ! -f .env.prod ]; then
  echo "Parking current .env.local as .env.prod (prod credentials keep living there)"
  cp .env.local .env.prod
fi
awk -F= '
  $1=="NEXT_PUBLIC_SUPABASE_URL" {next}
  $1=="NEXT_PUBLIC_SUPABASE_PUBLISHABLE_DEFAULT_KEY" {next}
  $1=="SUPABASE_SERVICE_ROLE_KEY" {next}
  $1=="SUPABASE_DB_URL" {next}
  $1=="ADMIN_NOTIFY_DEV_EMAIL" {next}
  {print}
' .env.prod > .env.local
{
  echo ""
  echo "# ── STAGING (written by scripts/staging-up.sh — run staging-down.sh to restore prod) ──"
  echo "# The anon JWT stands in for the publishable key; supabase-js accepts both."
  echo "# No SUPABASE_DB_URL on purpose: branch DB password isn't retrievable —"
  echo "# psql-dependent scripts fail loudly here instead of silently hitting prod."
  echo "NEXT_PUBLIC_SUPABASE_URL=$B_URL"
  echo "NEXT_PUBLIC_SUPABASE_PUBLISHABLE_DEFAULT_KEY=$B_ANON"
  echo "SUPABASE_SERVICE_ROLE_KEY=$B_SVC"
  echo "ADMIN_NOTIFY_DEV_EMAIL=$DEV_INBOX"
} >> .env.local
echo "Wrote .env.local → $B_URL"

# ── 4. Repoint the cloned webhook at the staging site ────────────────────────
sql_staging "update app_config set value = '$STAGING_SITE/api/hooks/new-profile' where key = 'new_profile_webhook_url';" >/dev/null
echo "app_config webhook → $STAGING_SITE/api/hooks/new-profile"

# ── 5. Vercel Preview env → branch ───────────────────────────────────────────
setpreview() {
  vercel env rm "$1" preview --yes >/dev/null 2>&1 || true
  printf '%s' "$2" | vercel env add "$1" preview >/dev/null
  echo "  preview env: $1"
}
setpreview NEXT_PUBLIC_SUPABASE_URL "$B_URL"
setpreview NEXT_PUBLIC_SUPABASE_PUBLISHABLE_DEFAULT_KEY "$B_ANON"
setpreview SUPABASE_SERVICE_ROLE_KEY "$B_SVC"
setpreview NEXT_PUBLIC_SITE_URL "$STAGING_SITE"
setpreview ADMIN_NOTIFY_DEV_EMAIL "$DEV_INBOX"
# Webhook route auth: the branch cloned prod's webhook_secret, so mirror
# prod's value into Preview (from the parked prod env).
WSECRET=$(grep '^SUPABASE_WEBHOOK_SECRET=' .env.prod | cut -d= -f2- || true)
[ -n "${WSECRET:-}" ] && setpreview SUPABASE_WEBHOOK_SECRET "$WSECRET"

echo ""
echo "Staging is up. Deploy it with:  git push origin staging   (re-push to rebuild)"
echo "All staging emails route to: $DEV_INBOX"
