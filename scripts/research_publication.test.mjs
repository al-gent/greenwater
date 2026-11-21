import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import test from 'node:test'
import ts from 'typescript'

function loadModule(filename, dependencies) {
  const source = readFileSync(new URL(`../${filename}`, import.meta.url), 'utf8')
  const { outputText } = ts.transpileModule(source, {
    compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022 },
  })
  const exports = {}
  const require = (name) => {
    assert.ok(Object.hasOwn(dependencies, name), `Unexpected dependency: ${name}`)
    return dependencies[name]
  }
  new Function('require', 'exports', outputText)(require, exports)
  return exports
}

function database(result) {
  const calls = []
  const query = {
    select(...args) { calls.push(['select', ...args]); return query },
    neq(...args) { calls.push(['neq', ...args]); return query },
    is() { return query },
    lt() { return query },
    gt() { return query },
    or(...args) { calls.push(['or', ...args]); return query },
    order() { return query },
    then(resolve, reject) { return Promise.resolve(result).then(resolve, reject) },
  }
  return { calls, from(table) { calls.push(['from', table]); return query } }
}

test('publication flags fail closed on missing settings or read errors', async () => {
  for (const result of [{ data: null, error: { message: 'missing table' } }, { data: [], error: null }]) {
    const { getResearchPublication } = loadModule('lib/research-publication.ts', {
      react: { cache: (callback) => callback },
      './supabase': { supabase: database(result) },
    })
    assert.deepEqual(await getResearchPublication(), { mfp: false, demo: false })
  }
})

test('publication flags allow restoring MFP and hiding demos independently', async () => {
  const { getResearchPublication } = loadModule('lib/research-publication.ts', {
    react: { cache: (callback) => callback },
    './supabase': { supabase: database({ data: [{ source_group: 'mfp', enabled: true }, { source_group: 'demo', enabled: false }], error: null }) },
  })
  assert.deepEqual(await getResearchPublication(), { mfp: true, demo: false })
})

const entries = [
  { id: 'real', source: 'vesselconnect', cruise: { source: 'vesselconnect' }, person: null, equipment: null },
  { id: 'demo', source: 'demo', cruise: null },
  { id: 'mfp', source: 'unols_mfp', cruise: null },
  { id: 'inventory', source: 'unols_mfp_inventory', cruise: null },
  { id: 'mfp-parent', source: 'vesselconnect', cruise: { source: 'unols_mfp' } },
  { id: 'mfp-person', source: 'vesselconnect', person: { source: 'unols_mfp' } },
  { id: 'mfp-equipment', source: 'vesselconnect', equipment: { source: 'unols_mfp_inventory' } },
  { id: 'demo-parent', source: 'vesselconnect', cruise: { source: 'demo' } },
]
const window = { vesselIds: [1], start: '2026-12-01', end: '2026-12-10' }

function timelineModule(mfp, result = { data: entries, error: null }) {
  const db = database(result)
  return {
    db,
    ...loadModule('lib/timeline-service.ts', {
      './supabase-admin': { supabaseAdmin: db },
      './research-publication': { getResearchPublication: async () => ({ mfp, demo: true }) },
    }),
  }
}

test('service-role conflict lookup excludes demos and hidden imports including linked resources', async () => {
  const { db, findConflicts } = timelineModule(false)
  assert.deepEqual(await findConflicts(window), [{ id: 'real', source: 'vesselconnect' }])
  assert.ok(db.calls.some((call) => call[0] === 'neq' && call[1] === 'source' && call[2] === 'demo'))
})

test('MFP conflicts return after approval but demos never block bookings', async () => {
  const { findConflicts } = timelineModule(true)
  assert.deepEqual((await findConflicts(window)).map((entry) => entry.id), ['real', 'mfp', 'inventory', 'mfp-parent', 'mfp-person', 'mfp-equipment'])
})

test('conflict lookup keeps the ignore-cruise filter and skips empty resources', async () => {
  const { db, findConflicts } = timelineModule(false)
  assert.deepEqual(await findConflicts({ start: window.start, end: window.end }), [])
  assert.equal(db.calls.length, 0)
  await findConflicts({ ...window, ignoreCruiseId: 'existing' })
  assert.ok(db.calls.some((call) => call[0] === 'or' && call[1] === 'cruise_id.is.null,cruise_id.neq.existing'))
})

test('conflict lookup propagates database failures rather than claiming availability', async () => {
  const error = new Error('database unavailable')
  const { findConflicts } = timelineModule(false, { data: null, error })
  await assert.rejects(findConflicts(window), error)
})

function bidRoute(project) {
  return loadModule('app/api/projects/[id]/bids/route.ts', {
    'next/server': { NextResponse: { json: (body, init) => Response.json(body, init) } },
    '@/lib/supabase-server': { createServerSupabaseClient: () => ({ auth: { getUser: async () => ({ data: { user: { id: 'user' } } }) } }) },
    '@/lib/supabase-admin': {},
    '@/lib/operators': {},
    '@/lib/projects': { getProject: async () => project },
    '@/lib/project-utils': {},
    '@/lib/project-notify': {},
  })
}

test('bidding rejects a demo before parsing or saving a bid', async () => {
  const { POST } = bidRoute({ source: 'demo', published_at: '2026-11-14' })
  const response = await POST({}, { params: { id: 'example' } })
  assert.equal(response.status, 409)
  assert.match((await response.json()).error, /Example/)
})

test('bidding cannot bypass public visibility for a hidden imported project', async () => {
  const { POST } = bidRoute(null)
  const response = await POST({}, { params: { id: 'hidden' } })
  assert.equal(response.status, 404)
})

test('timeline hover metadata identifies fictional dates, not actual availability', () => {
  const utils = loadModule('lib/cruise-utils.ts', {})
  const { vesselEntriesToTimeline } = loadModule('lib/cruise-timeline.ts', { './cruise-utils': utils })
  const result = vesselEntriesToTimeline([{
    id: 'demo-entry', vessel_id: 1, start_at: window.start, end_at: window.end, all_day: true,
    vessel: { id: 1, name: 'Example-linked vessel' },
    cruise: { id: 'demo-cruise', slug: 'demo-carbon', title: 'Example: Carbon survey', source: 'demo', departure_at: window.start, arrival_at: window.end },
  }])
  assert.equal(result.entries[0].meta.isDemo, true)
  assert.equal(result.entries[0].meta.stageLabel, 'Example only')
  assert.match(result.entries[0].detail, /not actual availability/)
})
