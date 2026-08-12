// Integration smoke test for the auth/membership/messaging plumbing.
// Runs against the REAL database in .env.local plus the local dev server —
// creates its own throwaway fixtures (users, memberships, messages) on
// retired vessels and deletes them afterward. Safe to run repeatedly.
//
//   npm run test:smoke        (dev server must be running on :3000)
//
// Covers the invariants that regress silently:
//   1. handle_new_user files the pending claim transactionally at signup
//   2. vessel_operators is the operator model (RLS: anon reads nothing)
//   3. message_unread_count counts both sides of a conversation
//   4. get_signup_stats returns all three metrics
//   5. app_config carries the webhook URL + secret
//   6. API routes reject unauthenticated / mis-authenticated callers

import { createClient } from '@supabase/supabase-js'
import { readFileSync } from 'node:fs'

for (const line of readFileSync('.env.local', 'utf8').split('\n')) {
  const m = line.match(/^([A-Z0-9_]+)=(.*)$/)
  if (m) process.env[m[1]] ??= m[2].replace(/^["']|["']$/g, '')
}

const BASE = process.env.SMOKE_BASE_URL ?? 'http://localhost:3000'
const admin = createClient(process.env.NEXT_PUBLIC_SUPABASE_URL, process.env.SUPABASE_SERVICE_ROLE_KEY, {
  auth: { autoRefreshToken: false, persistSession: false },
})
const anon = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL,
  process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_DEFAULT_KEY,
)

// Retired vessels — invisible to the live site, safe as fixtures.
const VESSEL_A = 3 // New Horizon
const VESSEL_B = 4 // Hudson (CCGS)

let pass = 0
let fail = 0
const check = (label, ok, detail = '') => {
  if (ok) { pass++; console.log(`  PASS  ${label}`) }
  else { fail++; console.log(`  FAIL  ${label}${detail ? ` — ${detail}` : ''}`) }
}

const cleanup = { users: [], messageThreads: [], webhookUrl: null }

async function main() {
  // Suppress the new-profile webhook for the duration of the run: it fires
  // from the SHARED database at the PRODUCTION endpoint, which would email
  // real admins about our synthetic signups (this happened on 2026-08-12).
  // Blank URL → the trigger logs a warning and skips; restored in tidy().
  const { data: savedUrl } = await admin.from('app_config').select('value').eq('key', 'new_profile_webhook_url').single()
  cleanup.webhookUrl = savedUrl?.value ?? null
  await admin.from('app_config').update({ value: '' }).eq('key', 'new_profile_webhook_url')
  console.log('webhook suppressed for this run')
  // ── 1. Signup trigger files the claim ────────────────────────────────────
  console.log('\n1. handle_new_user files pending claim at signup')
  const { data: claimant, error: cErr } = await admin.auth.admin.createUser({
    email: `smoke-claimant-${Date.now()}@example.invalid`,
    password: 'smoke-test-password-1234',
    email_confirm: false,
    user_metadata: {
      account_type: 'vessel', first_name: 'Smoke', last_name: 'Claimant',
      institution: 'Test Institute', title: 'Captain',
      pending_claim: { vessel_id: VESSEL_A, vessel_name: 'New Horizon', message: 'smoke test claim' },
    },
  })
  check('signup succeeds', !cErr, cErr?.message)
  const claimantId = claimant?.user?.id
  if (claimantId) cleanup.users.push(claimantId)

  const { data: claim } = await admin.from('vessel_claims')
    .select('vessel_id, status, claimant_name, role, organization')
    .eq('user_id', claimantId).maybeSingle()
  check('claim row created', !!claim)
  check('claim is pending', claim?.status === 'pending')
  check('claim fields mapped from metadata',
    claim?.claimant_name === 'Smoke Claimant' && claim?.role === 'Captain' && claim?.organization === 'Test Institute')

  // ── 2. Membership model ──────────────────────────────────────────────────
  console.log('\n2. vessel_operators membership model')
  const { data: operator, error: oErr } = await admin.auth.admin.createUser({
    email: `smoke-operator-${Date.now()}@example.invalid`,
    password: 'smoke-test-password-1234',
    email_confirm: false,
    user_metadata: { first_name: 'Smoke', last_name: 'Operator' },
  })
  check('operator user created', !oErr, oErr?.message)
  const operatorId = operator?.user?.id
  if (operatorId) cleanup.users.push(operatorId)

  const { error: mErr } = await admin.from('vessel_operators')
    .insert({ user_id: operatorId, vessel_id: VESSEL_A })
  check('membership insert', !mErr, mErr?.message)

  const { error: dupErr } = await admin.from('vessel_operators')
    .upsert({ user_id: operatorId, vessel_id: VESSEL_A }, { onConflict: 'user_id,vessel_id', ignoreDuplicates: true })
  check('duplicate membership upsert is a no-op', !dupErr, dupErr?.message)

  const { data: anonRows } = await anon.from('vessel_operators').select('vessel_id')
  check('RLS: anon reads zero membership rows', (anonRows ?? []).length === 0)

  const { data: operatorProfile } = await admin.from('profiles')
    .select('is_admin').eq('id', operatorId).single()
  check('membership grant never touches is_admin', operatorProfile?.is_admin === false)

  // ── 3. Unread counts, both sides ─────────────────────────────────────────
  console.log('\n3. message_unread_count (operator side + inquirer side)')
  const rootId = crypto.randomUUID()
  cleanup.messageThreads.push(rootId)
  await admin.from('messages').insert({
    id: rootId, thread_id: rootId, vessel_id: VESSEL_A,
    author_id: claimantId, author_role: 'scientist', body: 'smoke inquiry', status: 'new',
  })
  const { data: opUnread } = await admin.rpc('message_unread_count', { p_user_id: operatorId })
  check('new thread counts for the operator', opUnread === 1, `got ${opUnread}`)
  const { data: selfUnread } = await admin.rpc('message_unread_count', { p_user_id: claimantId })
  check("author's own new thread does not count for them", selfUnread === 0, `got ${selfUnread}`)

  await admin.from('messages').insert({
    thread_id: rootId, vessel_id: VESSEL_A,
    author_id: operatorId, author_role: 'operator', body: 'smoke reply',
  })
  await admin.from('messages').update({ status: 'responded' }).eq('id', rootId)
  const { data: opAfter } = await admin.rpc('message_unread_count', { p_user_id: operatorId })
  check('responded thread stops counting for operator', opAfter === 0, `got ${opAfter}`)
  const { data: sciUnread } = await admin.rpc('message_unread_count', { p_user_id: claimantId })
  check('operator reply counts as unread for inquirer', sciUnread === 1, `got ${sciUnread}`)

  await admin.from('messages').update({ scientist_read_at: new Date().toISOString() }).eq('id', rootId)
  const { data: sciAfter } = await admin.rpc('message_unread_count', { p_user_id: claimantId })
  check('read stamp clears inquirer unread', sciAfter === 0, `got ${sciAfter}`)

  // ── 4. Stats RPC ─────────────────────────────────────────────────────────
  console.log('\n4. get_signup_stats')
  const { data: stats, error: sErr } = await admin.rpc('get_signup_stats')
  check('RPC callable via service role', !sErr, sErr?.message)
  const metrics = new Set((stats ?? []).map((r) => r.metric))
  check('returns all three metrics',
    ['researcher_signups', 'operator_signups', 'vessels_listed'].every((m) => metrics.has(m)))

  // ── 5. Webhook config ────────────────────────────────────────────────────
  console.log('\n5. app_config webhook wiring')
  const { data: cfg } = await admin.from('app_config').select('key, value')
  const cfgMap = Object.fromEntries((cfg ?? []).map((r) => [r.key, r.value]))
  check('webhook URL configured', (cfgMap.new_profile_webhook_url ?? '').startsWith('https://'))
  check('webhook secret configured (64 chars)', (cfgMap.webhook_secret ?? '').length === 64)
  check('secret matches .env.local', cfgMap.webhook_secret === process.env.SUPABASE_WEBHOOK_SECRET)

  // ── 6. API auth walls (dev server) ───────────────────────────────────────
  console.log('\n6. API auth walls')
  const post = (path, headers, body) =>
    fetch(`${BASE}${path}`, { method: 'POST', headers: { 'Content-Type': 'application/json', ...headers }, body: JSON.stringify(body) })
      .then((r) => r.status).catch(() => 'unreachable')

  check('hooks/new-profile rejects missing secret (401)',
    (await post('/api/hooks/new-profile', {}, {})) === 401)
  check('hooks/new-profile rejects bad payload with real secret (400)',
    (await post('/api/hooks/new-profile', { 'x-webhook-secret': process.env.SUPABASE_WEBHOOK_SECRET }, { type: 'NOPE' })) === 400)
  check('vessels/position rejects unauthenticated (401)',
    (await post('/api/vessels/position', {}, { vessel_id: VESSEL_A, port_text: 'x', lat: 0, lon: 0 })) === 401)
  check('vessels/update rejects unauthenticated (401)',
    (await fetch(`${BASE}/api/vessels/update`, { method: 'PATCH', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ vessel_id: VESSEL_A }) }).then((r) => r.status).catch(() => 'unreachable')) === 401)
  const opsMe = await fetch(`${BASE}/api/operators/me`).then((r) => r.json()).catch(() => null)
  check('operators/me returns empty context unauthenticated',
    Array.isArray(opsMe?.vesselIds) && opsMe.vesselIds.length === 0 && opsMe?.isAdmin === false)
}

async function tidy() {
  console.log('\ncleanup:')
  // Restore the webhook URL — but never "restore" an empty value over a real
  // one, and skip entirely if it was already blank (e.g. suppressed by hand).
  if (cleanup.webhookUrl) {
    await admin.from('app_config').update({ value: cleanup.webhookUrl }).eq('key', 'new_profile_webhook_url')
    console.log('  webhook restored')
  } else {
    console.log('  webhook was already suppressed — left as-is')
  }
  for (const threadId of cleanup.messageThreads) {
    await admin.from('messages').delete().eq('thread_id', threadId)
  }
  for (const id of cleanup.users) {
    await admin.from('vessel_claims').delete().eq('user_id', id)
    await admin.from('vessel_operators').delete().eq('user_id', id)
    await admin.auth.admin.deleteUser(id)
  }
  // verify nothing is left
  const residue = []
  for (const id of cleanup.users) {
    const { data: p } = await admin.from('profiles').select('id').eq('id', id).maybeSingle()
    if (p) residue.push(`profile ${id}`)
  }
  console.log(residue.length ? `  RESIDUE LEFT: ${residue.join(', ')}` : '  all fixtures removed')
}

try {
  await main()
} catch (err) {
  fail++
  console.error('\nUNCAUGHT:', err)
} finally {
  await tidy()
}
console.log(`\n${pass} passed, ${fail} failed`)
process.exit(fail > 0 ? 1 : 0)
