import assert from 'node:assert/strict'
import test from 'node:test'
import { gfwSyncStatus, syncGfw } from '../lib/gfw-sync-core.mjs'

const portDataset = 'public-global-port-visits-events:latest'
const loiteringDataset = 'public-global-loitering-events:latest'
const vessel = { id: 5, name: 'Roger Revelle', vessel_id_gfw: 'existing-vessel-id' }
const portEvent = {
  start: '2026-11-05T23:06:29.000Z',
  end: '2026-11-06T23:06:29.000Z',
  position: { lat: 1, lon: 2 },
  vessel: { name: 'ROGER REVELLE' },
  port_visit: {
    confidence: '3',
    durationHrs: 24,
    endAnchorage: { name: 'SAN DIEGO', flag: 'USA', lat: 32, lon: -117 },
  },
}
const loiteringEvent = {
  start: '2026-11-07T00:00:00.000Z',
  end: '2026-11-07T03:00:00.000Z',
  position: { lat: 30, lon: -120 },
  loitering: { totalTimeHours: 3, averageSpeedKnots: 0.5, averageDistanceFromShoreKm: 50 },
}

function database(tables = {}) {
  const reads = []
  const writes = []
  return {
    reads,
    writes,
    from(table) {
      reads.push(table)
      const query = {
        select() { return query },
        not() { return query },
        order() { return query },
        range() { return query },
        is() { return query },
        limit() { return query },
        in() { return query },
        then(resolve, reject) {
          return Promise.resolve({ data: tables[table] ?? (table === 'vessels' ? [vessel] : []), error: null }).then(resolve, reject)
        },
        async upsert(rows, options) {
          writes.push({ table, rows, options })
          return { error: null }
        },
      }
      return query
    },
  }
}

function mockApi(context, handler = () => ({ entries: [], total: 0 })) {
  const requests = []
  context.mock.method(globalThis, 'fetch', async (input, options) => {
    const url = new URL(input)
    requests.push(url)
    assert.equal(options.headers.Authorization, 'Bearer test-key')
    assert.ok(options.signal instanceof AbortSignal)
    const body = await handler(url)
    if (body instanceof Response) return body
    return Response.json(url.pathname.includes('/datasets/') ? { id: 'dataset:v5.0' } : body)
  })
  return requests
}

const options = { log() {} }

test('only isolated vessel misses are warnings, counting each vessel once', () => {
  const fiveVessels = [1, 2, 3, 4, 5].flatMap((vesselId) =>
    ['ports', 'loitering'].map((stream) => ({ vesselId, stream })))
  const outcome = (vessels, missedStreams, otherErrors = 0) =>
    gfwSyncStatus({ vessels, missedStreams, errors: missedStreams.length + otherErrors })
  assert.equal(outcome(437, []), 'success')
  assert.equal(outcome(437, fiveVessels), 'warning')
  assert.equal(outcome(437, [...fiveVessels, { vesselId: 6, stream: 'ports' }]), 'failure')
  assert.equal(outcome(100, fiveVessels), 'warning')
  assert.equal(outcome(99, fiveVessels), 'failure')
  assert.equal(outcome(1, [{ vesselId: 1, stream: 'ports' }]), 'failure')
  assert.equal(outcome(437, fiveVessels, 1), 'failure')
  assert.equal(outcome(437, [], 1), 'failure')
})

test('uses v5 port visits, preserves confidence, anchorage mapping and deduplication', async (context) => {
  const existingStart = '2026-11-01T00:00:00.000Z'
  const db = database({ port_calls: [{ vessel_id: vessel.id, arrived_at: '2026-11-01T00:00:00+00:00' }] })
  const requests = mockApi(context, (url) => ({
    entries: url.searchParams.get('datasets[0]') === portDataset
      ? [portEvent, { ...portEvent, start: existingStart }, { ...portEvent, port_visit: { confidence: '1' } }]
      : [loiteringEvent],
    total: 3,
  }))
  const result = await syncGfw(db, 'test-key', options)
  assert.deepEqual(requests.slice(0, 2).map((url) => url.pathname), [
    `/v3/datasets/${portDataset}`, `/v3/datasets/${loiteringDataset}`,
  ])
  for (const url of requests.slice(2)) {
    assert.equal(url.searchParams.get('vessels[0]'), vessel.vessel_id_gfw)
    assert.equal(url.searchParams.get('limit'), '5')
    assert.equal(url.searchParams.get('sort'), '-start')
  }
  assert.equal(result.newPortCalls, 1)
  assert.equal(result.newLoiteringEvents, 1)
  assert.equal(result.errors, 0)
  assert.equal(db.writes[0].rows[0].lat, 32)
  assert.equal(db.writes[0].rows[0].lon, -117)
  assert.equal(db.writes[0].rows[0].confidence, 3)
  assert.deepEqual(db.writes[0].options, { onConflict: 'vessel_id,arrived_at', ignoreDuplicates: true })
})

test('missing dataset fails before database access or vessel requests', async (context) => {
  const db = database()
  const requests = mockApi(context, () => Response.json({ messages: [{ detail: 'Dataset not found' }] }, { status: 404 }))
  await assert.rejects(syncGfw(db, 'test-key', options), /GFW API 404.*public-global-port-visits-events:latest.*Dataset not found/)
  assert.equal(requests.length, 1)
  assert.deepEqual(db.reads, [])
  assert.deepEqual(db.writes, [])
})

test('validates both datasets before writing any events', async (context) => {
  const db = database()
  const requests = mockApi(context, (url) => url.pathname.endsWith(loiteringDataset)
    ? Response.json({ messages: [{ detail: 'Dataset unavailable' }] }, { status: 404 })
    : {})
  await assert.rejects(syncGfw(db, 'test-key', options), /GFW API 404.*loitering.*Dataset unavailable/)
  assert.equal(requests.length, 2)
  assert.deepEqual(db.reads, [])
})

test('loitering-only mode does not require the port visit dataset', async (context) => {
  const db = database()
  const requests = mockApi(context, () => ({ entries: [loiteringEvent], total: 1 }))
  const result = await syncGfw(db, 'test-key', { ...options, datasets: ['loitering'] })
  assert.equal(requests.length, 2)
  assert.equal(requests[0].pathname, `/v3/datasets/${loiteringDataset}`)
  assert.equal(result.newLoiteringEvents, 1)
  assert.ok(!db.reads.includes('port_calls'))
  assert.ok(!db.reads.includes('vessel_last_port'))
})

test('a port request failure does not skip loitering or later vessels', async (context) => {
  const db = database({ vessels: [vessel, { ...vessel, id: 6, vessel_id_gfw: 'another-id' }] })
  const logs = []
  const requests = mockApi(context, (url) => {
    if (url.searchParams.get('datasets[0]') !== portDataset) return { entries: [loiteringEvent], total: 1 }
    if (url.searchParams.get('vessels[0]') === 'another-id') {
      const cause = Object.assign(new Error('peer closed the connection'), { code: 'ECONNRESET' })
      throw new TypeError('fetch failed', { cause })
    }
    return new Response('upstream socket hang up', {
      status: 503, statusText: 'Service Unavailable', headers: { 'x-request-id': 'gateway-123' },
    })
  })
  const result = await syncGfw(db, 'test-key', { log: (message) => logs.push(message) })
  assert.equal(result.errors, 2)
  assert.equal(result.status, 'failure')
  assert.deepEqual(result.missedStreams, [{ vesselId: 5, stream: 'ports' }, { vesselId: 6, stream: 'ports' }])
  assert.equal(result.newPortCalls, 0)
  assert.equal(result.newLoiteringEvents, 2)
  assert.equal(requests.filter((url) => url.searchParams.get('datasets[0]') === portDataset).length, 6)
  assert.ok(logs.some((line) => /attempt 3 failed after \d+ms: GFW API 503.*upstream socket hang up.*gateway-123.*final attempt/.test(line)))
  assert.ok(logs.some((line) => /attempt 3 failed.*fetch failed.*ECONNRESET peer closed the connection.*another-id.*final attempt/.test(line)))
  assert.ok(logs.every((line) => !line.includes('test-key')))
})

test('recovers from a dropped connection and 503 on the same event page', async (context) => {
  const db = database()
  const offsets = []
  mockApi(context, (url) => {
    if (url.pathname.includes('/datasets/')) return {}
    const offset = url.searchParams.get('offset')
    offsets.push(offset)
    if (offset === '0') {
      const entries = Array.from({ length: 500 }, (_, index) => ({
        ...portEvent, start: new Date(Date.UTC(2020, 0, index + 1)).toISOString(),
      }))
      return { entries, total: 501 }
    }
    if (offsets.length === 2) throw new TypeError('fetch failed')
    if (offsets.length === 3) return new Response('socket hang up', { status: 503 })
    return { entries: [portEvent], total: 501 }
  })
  const result = await syncGfw(db, 'test-key', { ...options, catchUp: true, datasets: ['ports'] })
  assert.deepEqual(offsets, ['0', '500', '500', '500'])
  assert.equal(result.errors, 0)
  assert.equal(result.newPortCalls, 501)
  assert.equal(result.status, 'success')
  assert.deepEqual(result.missedStreams, [])
  assert.equal(db.writes.length, 1)
})

test('recovers from a timeout fetching dataset metadata', async (context) => {
  let attempts = 0
  const requests = mockApi(context, () => {
    if (++attempts === 1) throw new DOMException('Request timed out', 'TimeoutError')
    return { entries: [], total: 0 }
  })
  const result = await syncGfw(database(), 'test-key', { ...options, datasets: ['loitering'] })
  assert.deepEqual(requests.map((url) => url.pathname), [
    `/v3/datasets/${loiteringDataset}`, `/v3/datasets/${loiteringDataset}`, '/v3/events',
  ])
  assert.equal(result.errors, 0)
})

for (const status of [401, 403]) {
  for (const stream of ['ports', 'loitering']) {
    test(`${status} during ${stream} stops the run instead of repeating for every vessel`, async (context) => {
      const db = database({ vessels: [vessel, { ...vessel, id: 6 }] })
      const requests = mockApi(context, (url) => url.pathname.endsWith('/events')
        ? Response.json({ message: 'Access denied' }, { status })
        : {})
      await assert.rejects(syncGfw(db, 'test-key', { ...options, datasets: [stream] }), new RegExp(`GFW API ${status}.*Access denied`))
      assert.equal(requests.length, 2)
      assert.deepEqual(db.writes, [])
    })
  }
}

test('backfill paginates and overwrites rather than ignoring existing events', async (context) => {
  const db = database()
  const requests = mockApi(context, (url) => ({
    entries: url.searchParams.get('offset') === '0'
      ? Array.from({ length: 500 }, (_, index) => ({ ...portEvent, start: new Date(Date.UTC(2020, 0, index + 1)).toISOString() }))
      : [portEvent],
    total: 501,
  }))
  const result = await syncGfw(db, 'test-key', { ...options, datasets: ['ports'], backfill: true })
  assert.equal(result.newPortCalls, 501)
  assert.deepEqual(requests.slice(1).map((url) => url.searchParams.get('offset')), ['0', '500'])
  assert.deepEqual(db.writes[0].options, { onConflict: 'vessel_id,arrived_at', ignoreDuplicates: false })
})

for (const stream of ['ports', 'loitering']) {
  test(`catch-up paginates ${stream} without rewriting existing events`, async (context) => {
    const table = stream === 'ports' ? 'port_calls' : 'loitering_events'
    const timestamp = stream === 'ports' ? 'arrived_at' : 'started_at'
    const event = stream === 'ports' ? portEvent : loiteringEvent
    const db = database({ [table]: [{ vessel_id: vessel.id, [timestamp]: '2020-01-01T00:00:00+00:00' }] })
    const requests = mockApi(context, (url) => ({
      entries: url.searchParams.get('offset') === '0'
        ? Array.from({ length: 500 }, (_, index) => ({ ...event, start: new Date(Date.UTC(2020, 0, index + 1)).toISOString() }))
        : [event],
      total: 501,
    }))
    const result = await syncGfw(db, 'test-key', { ...options, datasets: [stream], catchUp: true })
    assert.equal(result.errors, 0)
    assert.deepEqual(requests.slice(1).map((url) => url.searchParams.get('offset')), ['0', '500'])
    assert.ok(requests.slice(1).every((url) => url.searchParams.get('limit') === '500'))
    assert.equal(db.writes[0].rows.length, 500)
    assert.ok(db.writes[0].rows.every((row) => row[timestamp] !== '2020-01-01T00:00:00.000Z'))
    assert.deepEqual(db.writes[0].options, { onConflict: `vessel_id,${timestamp}`, ignoreDuplicates: true })
  })
}

test('catch-up cannot accidentally enable overwrite mode', async (context) => {
  const db = database()
  const requests = mockApi(context)
  await assert.rejects(syncGfw(db, 'test-key', { ...options, catchUp: true, backfill: true }), /not both/)
  assert.equal(requests.length, 0)
  assert.deepEqual(db.reads, [])
})
