#!/usr/bin/env bash
# Tests for messaging v0 routing (20260803_messaging_notify_routing.sql +
# /api/webhooks/brevo). Two parts:
#   A. Schema/RLS — runs against the live DB inside rolled-back transactions.
#   B. Webhook contract — needs `npm run dev` on :3000; creates its own test
#      thread row and deletes it afterwards.
#
# Run:  bash scripts/test_messaging_v0.sh
# Requires SUPABASE_DB_URL and BREVO_WEBHOOK_SECRET in .env.local / .env.
#
# NOT covered here (needs an authenticated browser session — manual checklist):
# the three-way routing branch in POST /api/messages itself.

set -u
cd "$(dirname "$0")/.."
export $(grep -h "^SUPABASE_DB_URL" .env* | head -1)
SECRET=$(grep -h "^BREVO_WEBHOOK_SECRET" .env* | head -1 | cut -d= -f2)
BASE="http://localhost:3000/api/webhooks/brevo"
FAILS=0

pass() { echo "PASS: $1"; }
fail() { echo "FAIL: $1"; FAILS=$((FAILS + 1)); }

# ── A. Schema & RLS ─────────────────────────────────────────────────────────

# A1: bookkeeping columns exist on messages
if psql "$SUPABASE_DB_URL" -q -c "select notified_via, notified_email, delivery_status from messages limit 0;" >/dev/null 2>&1; then
  pass "A1 messages has notified_via/notified_email/delivery_status"
else
  fail "A1 bookkeeping columns missing on messages"
fi

# A2: authenticated role can NOT insert directly (forge-hole closed).
# Simulates a PostgREST request from a signed-in user; expects RLS denial.
OUT=$(psql "$SUPABASE_DB_URL" -t -A 2>&1 <<'SQL'
begin;
do $$
declare
  uid uuid;
begin
  select id into uid from profiles limit 1;
  perform set_config('request.jwt.claims', json_build_object('sub', uid, 'role', 'authenticated')::text, true);
  set local role authenticated;
  begin
    insert into messages (id, thread_id, vessel_id, author_id, author_role, body)
    values (gen_random_uuid(), gen_random_uuid(), (select id from vessels limit 1), uid, 'operator', 'forged');
    raise notice 'RESULT: insert-allowed';
  exception when insufficient_privilege then
    raise notice 'RESULT: insert-denied';
  end;
end $$;
rollback;
SQL
)
if echo "$OUT" | grep -q "RESULT: insert-denied"; then
  pass "A2 authenticated direct insert denied by RLS"
else
  fail "A2 authenticated direct insert was NOT denied: $OUT"
fi

# A3: service-role path (superuser here) still inserts fine — rolled back
if psql "$SUPABASE_DB_URL" -q 2>/dev/null <<'SQL'
begin;
insert into messages (id, thread_id, vessel_id, author_id, author_role, body)
values (gen_random_uuid(), gen_random_uuid(), (select id from vessels limit 1), (select id from profiles limit 1), 'scientist', 'service role test');
rollback;
SQL
then
  pass "A3 service-role insert path unaffected"
else
  fail "A3 service-role insert failed"
fi

# ── B. Webhook contract ─────────────────────────────────────────────────────

if ! curl -s -o /dev/null --max-time 3 http://localhost:3000/; then
  echo "SKIP: B tests need the dev server (npm run dev) on :3000"
  exit $((FAILS > 0 ? 1 : 0))
fi
if [ -z "$SECRET" ]; then
  fail "B0 BREVO_WEBHOOK_SECRET not found in .env*"
  exit 1
fi

TID=$(uuidgen | tr 'A-Z' 'a-z')
psql "$SUPABASE_DB_URL" -q -c "
insert into messages (id, thread_id, vessel_id, author_id, author_role, body, notified_via, notified_email, delivery_status)
values ('$TID', '$TID', (select id from vessels limit 1), (select id from profiles limit 1),
        'scientist', 'webhook test row', 'vessel_email', 'test@example.com', 'sent');"
trap 'psql "$SUPABASE_DB_URL" -q -c "delete from messages where id='"'"'$TID'"'"';"' EXIT

status_now() {
  psql "$SUPABASE_DB_URL" -t -A -c "select delivery_status from messages where id='$TID';" | head -1
}

# B1: wrong token → 401
CODE=$(curl -s -o /dev/null -w "%{http_code}" -X POST "$BASE?token=wrong" -H "Content-Type: application/json" -d '{"event":"hard_bounce"}')
[ "$CODE" = "401" ] && pass "B1 wrong token rejected (401)" || fail "B1 expected 401, got $CODE"

# B2: malformed JSON → 400
CODE=$(curl -s -o /dev/null -w "%{http_code}" -X POST "$BASE?token=$SECRET" -H "Content-Type: application/json" -d 'not json')
[ "$CODE" = "400" ] && pass "B2 malformed JSON rejected (400)" || fail "B2 expected 400, got $CODE"

# B3: hard_bounce with tags[] → bounced
curl -s -o /dev/null -X POST "$BASE?token=$SECRET" -H "Content-Type: application/json" \
  -d "{\"event\":\"hard_bounce\",\"tags\":[\"inquiry-$TID\"]}"
[ "$(status_now)" = "bounced" ] && pass "B3 hard_bounce recorded as bounced" || fail "B3 expected bounced, got $(status_now)"

# B4: delivered after a soft bounce overwrites (retry succeeded)
curl -s -o /dev/null -X POST "$BASE?token=$SECRET" -H "Content-Type: application/json" \
  -d "{\"event\":\"delivered\",\"tags\":[\"inquiry-$TID\"]}"
[ "$(status_now)" = "delivered" ] && pass "B4 delivered overwrites bounced" || fail "B4 expected delivered, got $(status_now)"

# B5: unknown event → no change
curl -s -o /dev/null -X POST "$BASE?token=$SECRET" -H "Content-Type: application/json" \
  -d "{\"event\":\"opened\",\"tags\":[\"inquiry-$TID\"]}"
[ "$(status_now)" = "delivered" ] && pass "B5 untracked event ignored" || fail "B5 status changed on untracked event: $(status_now)"

# B6: legacy comma-string `tag` field also matches
curl -s -o /dev/null -X POST "$BASE?token=$SECRET" -H "Content-Type: application/json" \
  -d "{\"event\":\"blocked\",\"tag\":\"other,inquiry-$TID\"}"
[ "$(status_now)" = "blocked" ] && pass "B6 legacy tag string matched" || fail "B6 expected blocked, got $(status_now)"

# B7: event with someone else's tag → our row untouched
curl -s -o /dev/null -X POST "$BASE?token=$SECRET" -H "Content-Type: application/json" \
  -d "{\"event\":\"hard_bounce\",\"tags\":[\"inquiry-00000000-0000-0000-0000-000000000000\"]}"
[ "$(status_now)" = "blocked" ] && pass "B7 non-matching tag leaves row untouched" || fail "B7 row changed by foreign tag: $(status_now)"

# ── C. message_unread_count RPC (rolled back; repurposes two real profiles
#      and an unmessaged vessel inside the transaction) ───────────────────────

OUT=$(psql "$SUPABASE_DB_URL" -t -A 2>&1 <<'SQL'
begin;
do $$
declare
  sci uuid; op uuid; v integer; tid uuid := gen_random_uuid(); b0 int; n int;
begin
  select id into sci from profiles order by id limit 1;
  select id into op from profiles where id <> sci order by id limit 1;
  select id into v from vessels where id not in (select distinct vessel_id from messages) limit 1;
  if op is null or v is null then raise notice 'RESULT: C-skip'; return; end if;
  update profiles set role = 'scientist' where id = sci;
  update profiles set role = 'operator', vessel_id = v where id = op;
  b0 := message_unread_count(sci);  -- sci may have real unread threads; assert deltas

  insert into messages (id, thread_id, vessel_id, author_id, author_role, body, status)
  values (tid, tid, v, sci, 'scientist', 'unread test', 'new');

  n := message_unread_count(op);
  if n <> 1 then raise exception 'C1 FAIL: operator expected 1, got %', n; end if;
  raise notice 'RESULT: C1-pass';

  n := message_unread_count(sci);
  if n <> b0 then raise exception 'C2 FAIL: scientist expected %, got %', b0, n; end if;
  raise notice 'RESULT: C2-pass';

  insert into messages (thread_id, vessel_id, author_id, author_role, body)
  values (tid, v, op, 'operator', 'reply');

  n := message_unread_count(sci);
  if n <> b0 + 1 then raise exception 'C3 FAIL: scientist expected %, got %', b0 + 1, n; end if;
  raise notice 'RESULT: C3-pass';

  update messages set scientist_read_at = now() where id = tid;
  n := message_unread_count(sci);
  if n <> b0 then raise exception 'C4 FAIL: scientist expected % after read, got %', b0, n; end if;
  raise notice 'RESULT: C4-pass';

  update messages set status = 'read' where id = tid;
  n := message_unread_count(op);
  if n <> 0 then raise exception 'C5 FAIL: operator expected 0 after read, got %', n; end if;
  raise notice 'RESULT: C5-pass';
end $$;
rollback;
SQL
)
if echo "$OUT" | grep -q "C-skip"; then
  echo "SKIP: C tests need 2 profiles and an unmessaged vessel"
else
  for t in C1 C2 C3 C4 C5; do
    if echo "$OUT" | grep -q "RESULT: $t-pass"; then
      case $t in
        C1) pass "C1 new thread counts for operator" ;;
        C2) pass "C2 own thread w/o operator reply not unread for scientist" ;;
        C3) pass "C3 operator reply makes thread unread for scientist" ;;
        C4) pass "C4 scientist_read_at clears scientist unread" ;;
        C5) pass "C5 status=read clears operator unread" ;;
      esac
    else
      fail "$t — $(echo "$OUT" | grep -m1 'FAIL' || echo 'no result emitted')"
    fi
  done
fi

echo
if [ "$FAILS" -eq 0 ]; then echo "ALL TESTS PASSED"; else echo "$FAILS TEST(S) FAILED"; exit 1; fi
