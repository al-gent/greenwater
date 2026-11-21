import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import test from 'node:test'
import ts from 'typescript'
import * as jsxRuntime from 'react/jsx-runtime'

function load(filename, dependencies = {}) {
  const { outputText } = ts.transpileModule(readFileSync(new URL(`../${filename}`, import.meta.url), 'utf8'), {
    compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022, jsx: ts.JsxEmit.ReactJSX },
  })
  const exports = {}
  new Function('require', 'exports', outputText)((name) => {
    assert.ok(Object.hasOwn(dependencies, name), `Unexpected dependency ${name}`)
    return dependencies[name]
  }, exports)
  return exports
}

const helpers = load('lib/project-utils.ts')
const errors = load('lib/project-write-errors.ts')
const authorId = '00000000-0000-0000-0000-000000000001'
const gearId = '00000000-0000-0000-0000-000000000010'
const project = { id: 'project-id', slug: 'research', source: 'vesselconnect', created_by: authorId, published_at: '2026-11-14' }

function harness({ result = { data: { changed: true }, error: null }, user = { id: authorId }, source = 'vesselconnect' } = {}) {
  const calls = []
  const notifications = []
  const dependencies = {
    'next/server': { NextResponse: { json: (body, init) => Response.json(body, init) } },
    '@/lib/supabase-server': { createServerSupabaseClient: () => ({ auth: { getUser: async () => ({ data: { user } }) } }) },
    '@/lib/supabase-admin': { supabaseAdmin: {
      rpc: async (name, args) => { calls.push({ name, args }); return result },
      from: (table) => {
        assert.equal(table, 'profiles', 'routes must not perform nontransactional writes')
        const query = { select: () => query, eq: () => query, single: async () => ({ data: { is_admin: false } }) }
        return query
      },
    } },
    '@/lib/projects': { ...helpers, getProjectAsAdmin: async () => ({ ...project, source }) },
    '@/lib/project-utils': helpers,
    '@/lib/project-write-errors': errors,
    '@/lib/project-notify': Object.fromEntries(['Accepted', 'Confirmed', 'Declined', 'Withdrawn'].map((event) => [
      `notifyBid${event}`, async (...args) => { notifications.push({ event, args }) },
    ])),
  }
  return {
    calls, notifications,
    bid: load('app/api/projects/[id]/bids/[bidId]/route.ts', dependencies).PATCH,
    project: load('app/api/projects/[id]/route.ts', dependencies).PATCH,
  }
}

const params = { params: { id: project.id, bidId: 'bid-id' } }
const request = (body) => new Request('http://test.invalid', { method: 'PATCH', body: JSON.stringify(body) })

test('gear validator rejects malformed and duplicate identities', () => {
  assert.equal(helpers.validateGear([{ id: gearId, label: 'CTD' }, { label: 'New gear' }]), null)
  assert.match(helpers.validateGear([{ id: 'invalid', label: 'CTD' }]), /ID/)
  assert.match(helpers.validateGear([{ id: gearId, label: 'CTD' }, { id: gearId, label: 'Duplicate' }]), /duplicate/)
})

test('project save sends preserved IDs and all edits to one transaction', async () => {
  const setup = harness()
  const gear = [{ id: gearId, label: 'CTD', quantity: 1 }]
  const response = await setup.project(request({ title: 'Updated title', gear, gear_ids: [gearId] }), params)
  assert.equal(response.status, 200)
  assert.deepEqual(setup.calls, [{ name: 'save_project_changes', args: {
    p_project_id: project.id, p_actor_id: authorId, p_updates: { title: 'Updated title' },
    p_gear: gear, p_gear_ids: [gearId], p_people: null,
  } }])
})

for (const [code, expectedStatus] of [['XX000', 500], ['23P01', 409], ['PT403', 403], ['PT404', 404], ['PT409', 409], ['23503', 400], ['40001', 409]]) {
  test(`failed transaction ${code} returns ${expectedStatus}, never success or email`, async () => {
    const setup = harness({ result: { data: null, error: { code, message: 'Injected database failure' } } })
    const response = await setup.bid(request({ action: 'confirm' }), params)
    assert.equal(response.status, expectedStatus)
    assert.equal((await response.json()).ok, undefined)
    assert.deepEqual(setup.notifications, [])
  })
}

test('failed project save returns an error, not a partially saved project', async () => {
  const setup = harness({ result: { data: null, error: { code: 'XX000' } } })
  const response = await setup.project(request({ title: 'New title' }), params)
  assert.equal(response.status, 500)
  assert.equal((await response.json()).project, undefined)
})

test('accept only notifies committed affected bids', async () => {
  const setup = harness({ result: { data: { changed: true, declined_ids: ['other-bid'] }, error: null } })
  assert.equal((await setup.bid(request({ action: 'accept' }), params)).status, 200)
  assert.deepEqual(setup.notifications, [{ event: 'Accepted', args: ['bid-id'] }, { event: 'Declined', args: ['other-bid'] }])
})

test('confirmation retries return the same cruise without duplicate notifications', async () => {
  const setup = harness({ result: { data: { changed: false, cruise_id: 'cruise-id', cruise_slug: 'booked-cruise' }, error: null } })
  const response = await setup.bid(request({ action: 'confirm' }), params)
  assert.deepEqual(await response.json(), { ok: true, cruise_id: 'cruise-id', cruise_slug: 'booked-cruise' })
  assert.deepEqual(setup.notifications, [])
})

test('accept retries do not notify again', async () => {
  const setup = harness({ result: { data: { changed: false }, error: null } })
  assert.equal((await setup.bid(request({ action: 'accept' }), params)).status, 200)
  assert.deepEqual(setup.notifications, [])
})

test('all bid mutations use the same locking transaction', async () => {
  for (const action of ['accept', 'confirm', 'decline', 'withdraw', 'update']) {
    const setup = harness()
    assert.equal((await setup.bid(request({ action }), params)).status, 200)
    assert.equal(setup.calls.length, 1)
    assert.equal(setup.calls[0].name, 'transition_project_bid')
    assert.equal(setup.calls[0].args.p_action, action)
  }
})

test('anonymous and demo mutations do not reach the transaction', async () => {
  for (const [options, status] of [[{ user: null }, 401], [{ source: 'demo' }, 409]]) {
    const setup = harness(options)
    assert.equal((await setup.bid(request({ action: 'confirm' }), params)).status, status)
    assert.equal((await setup.project(request({ title: 'Changed' }), params)).status, status)
    assert.deepEqual(setup.calls, [])
  }
})

test('project form includes IDs, baseline gear IDs and linked person identity', async () => {
  let posted
  const previousFetch = globalThis.fetch
  globalThis.fetch = async (_url, options) => {
    posted = JSON.parse(options.body)
    return Response.json({ slug: project.slug })
  }
  try {
    const Form = load('components/ProjectForm.tsx', {
      react: { useState: (initial) => [initial, () => {}] },
      'react/jsx-runtime': jsxRuntime,
      'next/navigation': { useRouter: () => ({ push: () => {}, refresh: () => {} }) },
      'next/dynamic': { default: () => 'map' },
      '@/lib/project-utils': helpers,
      '@/components/PersonPicker': { default: 'person-picker' },
      '@/components/PlaceAutocomplete': { default: 'place-search' },
    }).default
    const person = { id: 'person-row', person_id: authorId, role_id: 'pi', name: 'Researcher', notes: 'Keep this' }
    const form = Form({ project: { ...project, title: 'Title' }, gear: [{ id: gearId, label: 'CTD', quantity: 2, notes: '', equipment_type_id: null }], people: [person], equipmentTypes: [], roles: [{ id: 'pi', slug: 'pi', label: 'PI' }] })
    form.props.onSubmit({ preventDefault() {} })
    await new Promise((resolve) => setImmediate(resolve))
    assert.equal(posted.gear[0].id, gearId)
    assert.deepEqual(posted.gear_ids, [gearId])
    assert.deepEqual(posted.people, [person])
  } finally {
    globalThis.fetch = previousFetch
  }
})

test('availability shows only caller-readable details and keeps hidden reservations busy', async () => {
  const { visibleConflicts } = load('lib/visible-conflicts.ts')
  const dates = { start_at: '2050-01-01', end_at: '2050-01-02' }
  const entries = ['hidden', 'hidden-cruise', 'public', 'block'].map(id => ({ id, ...dates, label: 'private label', notes: 'private notes' }))
  const visible = [
    { id: 'hidden-cruise', label: 'unpublished', cruise_id: 'draft', cruise: null },
    { id: 'public', cruise_id: 'published', cruise: { title: 'Survey', slug: 'survey' } },
    { id: 'block', label: 'In port', cruise_id: null, cruise: null },
  ]
  const query = { select: () => query, in: () => query, returns: async () => ({ data: visible }) }
  const viewer = { from(table) { assert.equal(table, 'timeline_entries'); return query } }
  const busy = { id: null, ...dates, label: 'Busy', slug: null, kind: 'busy' }
  const expected = [busy, busy, { id: 'public', ...dates, label: 'Survey', slug: 'survey', kind: 'cruise' }, { id: 'block', ...dates, label: 'In port', slug: null, kind: 'block' }]
  assert.deepEqual(await visibleConflicts(viewer, entries, 'draft'), expected)
  assert.deepEqual(await visibleConflicts(viewer, entries, 'published'), expected.filter(row => row.id !== 'public'))
})
