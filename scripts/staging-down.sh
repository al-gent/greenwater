#!/usr/bin/env bash
# Tear down the ephemeral Supabase staging branch (stops its ~$0.01/hr
# billing) and point local dev back at production. Companion: staging-up.sh.
#
# The Vercel Preview env keeps the (now-dead) branch credentials on purpose:
# previews fail loudly instead of silently hitting prod. The next
# staging-up.sh run overwrites them again.
set -euo pipefail
cd "$(dirname "$0")/.."

PROD_REF=jmpxcsihkmyotidxjuyv
BRANCH=staging

if supabase branches get "$BRANCH" --project-ref "$PROD_REF" >/dev/null 2>&1; then
  # Persistent branches refuse deletion (422) — demote first.
  supabase branches update "$BRANCH" --project-ref "$PROD_REF" --persistent=false >/dev/null 2>&1 || true
  supabase branches delete "$BRANCH" --project-ref "$PROD_REF" --yes 2>/dev/null \
    || supabase branches delete "$BRANCH" --project-ref "$PROD_REF" <<< 'y'
  echo "Deleted branch '$BRANCH' — billing stopped."
else
  echo "No '$BRANCH' branch found — nothing to delete."
fi

if [ -f .env.prod ]; then
  cp .env.prod .env.local
  echo "Restored .env.local → production credentials."
else
  echo "WARNING: .env.prod not found — .env.local still points at the deleted branch."
fi
