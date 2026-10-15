/**
 * Backfill cruise_stops + cruise_hops from the MFP planner GeoJSON stored on
 * cruises.operating_area_geojson (source = 'unols_mfp').
 *
 *   Point features (Sampling Station, Mooring, Lander, ROV, AUV, Glider Station,
 *   Waypoint, Port)                → stops
 *   ShipTransect LineStrings, chained end→start → hops, endpoints matched to stops
 *   Leg ports (cruise_legs)        → port stops (the schedule's ports; a planner
 *                                    "Port" point is used only if no leg port is near)
 *
 * Leg placement: one-leg cruises get everything; multi-leg cruises get each stop
 * assigned to the leg whose ports bracket it in the chain, else leg_id null.
 * Idempotent: deletes and rewrites stops/hops for each cruise it touches.
 *
 * Usage:
 *   node scripts/import_mfp_stops_hops.mjs --dry-run
 *   node scripts/import_mfp_stops_hops.mjs --slug=sikuliaq-skq2609s-2026-09
 *   node scripts/import_mfp_stops_hops.mjs --limit=50
 *   node scripts/import_mfp_stops_hops.mjs
 */
import dotenv from 'dotenv'
dotenv.config({ path: '.env.local' })
import { createClient } from '@supabase/supabase-js'

const supabase = createClient(process.env.NEXT_PUBLIC_SUPABASE_URL, process.env.SUPABASE_SERVICE_ROLE_KEY)
const args = process.argv.slice(2)
const flag = (n) => args.includes(`--${n}`)
const opt = (n) => args.find((a) => a.startsWith(`--${n}=`))?.split('=')[1]
const dryRun = flag('dry-run')
const limit = opt('limit') ? parseInt(opt('limit'), 10) : undefined
const onlySlug = opt('slug')

const KIND = { 'Sampling Station': 'station', Mooring: 'mooring', Lander: 'lander', ROV: 'vehicle', AUV: 'vehicle', 'Glider Station': 'glider', Waypoint: 'waypoint', Port: 'port' }
const NEAR_STOP = 0.02   // degrees — same point
const NEAR_JOIN = 0.05   // degrees — consecutive segments join
const NEAR_PORT = 0.3    // degrees — same harbour
const near = (a, b, tol) => Math.abs(a[0] - b[0]) < tol && Math.abs(a[1] - b[1]) < tol
const num = (v) => (v == null || v === '' ? null : isNaN(parseFloat(v)) ? null : parseFloat(v))

async function fetchAll(table, cols, filter = (q) => q) {
  const out = []
  for (let from = 0; ; from += 1000) {
    const { data, error } = await filter(supabase.from(table).select(cols)).range(from, from + 999)
    if (error) throw error
    out.push(...data)
    if (data.length < 1000) return out
  }
}

/** Build stops + hops for one cruise. Returns { stops, hops, stats }. */
function plan(cruise, legs) {
  const feats = cruise.operating_area_geojson?.features ?? []

  // --- candidate stops: leg ports first (authoritative), then planner points
  const stops = [] // { kind, name, lon, lat, station_hours, depth_m, external_id, leg_id, portOfLeg? }
  for (const l of legs) {
    for (const [name, lat, lon, role] of [[l.depart_port, l.depart_lat, l.depart_lon, 'depart'], [l.arrive_port, l.arrive_lat, l.arrive_lon, 'arrive']]) {
      if (lat == null || lon == null) continue
      const existing = stops.find((s) => s.kind === 'port' && near([s.lon, s.lat], [lon, lat], NEAR_PORT))
      if (existing) { existing.legRoles.push({ leg: l, role }); continue }
      stops.push({ kind: 'port', name: name.replace(/\s*\(.*$/, ''), lon, lat, station_hours: null, depth_m: null, external_id: null, legRoles: [{ leg: l, role }] })
    }
  }
  for (const f of feats) {
    const kind = KIND[f.properties?.Type]
    if (!kind || f.geometry?.type !== 'Point') continue
    const [lon, lat] = f.geometry.coordinates
    if (kind === 'port' && stops.some((s) => s.kind === 'port' && near([s.lon, s.lat], [lon, lat], NEAR_PORT))) continue // schedule's port wins
    if (stops.some((s) => near([s.lon, s.lat], [lon, lat], NEAR_STOP) && s.kind === kind)) continue // duplicate point
    stops.push({ kind, name: f.properties?.Name || null, lon, lat, station_hours: num(f.properties?.TimeAtStation), depth_m: num(f.properties?.ExpectedSeaDepth), external_id: f.properties?.Link_id || null, legRoles: [] })
  }

  // --- hops: ShipTransect segments chained end→start
  const segs = feats
    .filter((f) => f.properties?.Type === 'ShipTransect' && f.geometry?.type === 'LineString' && f.geometry.coordinates.length >= 2)
    .map((f, i) => ({ i, coords: f.geometry.coordinates, start: f.geometry.coordinates[0], end: f.geometry.coordinates.at(-1), hours: num(f.properties?.TravelTime), speed: num(f.properties?.ShipSpeed), external_id: f.properties?.Link_id || null }))
  const stopAt = (pt) => {
    let hit = stops.find((s) => s.kind === 'port' && near([s.lon, s.lat], pt, NEAR_PORT)) || stops.find((s) => near([s.lon, s.lat], pt, NEAR_STOP))
    if (!hit) { // an unnamed route vertex — make it a waypoint so the hop has endpoints
      hit = { kind: 'waypoint', name: null, lon: pt[0], lat: pt[1], station_hours: null, depth_m: null, external_id: null, legRoles: [], synthetic: true }
      stops.push(hit)
    }
    return hit
  }
  // Chain segments end→start. Several chains can exist (planner drawn in pieces,
  // grid surveys); start each at a departure port if possible, else at a segment
  // whose start is not another segment's end, else anywhere.
  const ordered = []
  const used = new Set()
  const isHead = (s) => !segs.some((o) => o.i !== s.i && !used.has(o.i) && near(o.end, s.start, NEAR_JOIN))
  let chains = 0
  while (used.size < segs.length) {
    const rest = segs.filter((s) => !used.has(s.i))
    let cur = rest.find((s) => stops.some((p) => p.kind === 'port' && p.legRoles.some((r) => r.role === 'depart') && near([p.lon, p.lat], s.start, NEAR_PORT)))
      || rest.find(isHead) || rest[0]
    chains++
    while (cur && !used.has(cur.i)) {
      ordered.push(cur); used.add(cur.i)
      cur = segs.find((s) => !used.has(s.i) && near(s.start, cur.end, NEAR_JOIN))
    }
  }
  const leftovers = { length: Math.max(0, chains - 1) } // extra chains beyond the first

  // A segment whose ends resolve to the same stop (a loop back to a station, or a
  // short leg inside one harbour) is not a transit between stops — dropped.
  let loops = 0
  const hops = ordered
    .map((s) => ({ from: stopAt(s.start), to: stopAt(s.end), hours: s.hours, speed_kn: s.speed, track: s.coords.length > 2 ? { type: 'LineString', coordinates: s.coords } : null, external_id: s.external_id }))
    .filter((h) => h.from !== h.to || (loops++, false))

  // --- sailing order: walk the hop chain; stops not on any hop go after, in feature order
  const seqOf = new Map()
  let n = 0
  for (const h of hops) { if (!seqOf.has(h.from)) seqOf.set(h.from, ++n); if (!seqOf.has(h.to)) seqOf.set(h.to, ++n) }
  for (const s of stops) if (!seqOf.has(s)) seqOf.set(s, ++n)
  stops.sort((a, b) => seqOf.get(a) - seqOf.get(b))

  // --- leg placement. A planner port that matches no leg port is not in the
  // schedule (a stale or unbooked plan) — keep it, but never place it in a leg.
  const plannerPort = (s) => s.kind === 'port' && s.legRoles.length === 0
  if (legs.length === 1) {
    for (const s of stops) s.leg_id = plannerPort(s) ? null : legs[0].id
  } else {
    // A port stop belongs to the legs it bounds; a non-port stop takes the leg of the
    // nearest preceding port in sailing order whose leg's arrival port comes later.
    let currentLeg = null
    for (const s of stops) {
      if (s.kind === 'port') {
        if (plannerPort(s)) { s.leg_id = null; continue }
        const dep = s.legRoles.find((r) => r.role === 'depart')
        currentLeg = dep ? dep.leg : null
        s.leg_id = (dep ?? s.legRoles[0])?.leg?.id ?? null
      } else {
        s.leg_id = currentLeg?.id ?? null
      }
    }
  }

  const stats = { stops: stops.length, ports: stops.filter((s) => s.kind === 'port').length, synthetic: stops.filter((s) => s.synthetic).length, hops: hops.length, chained: ordered.length, extra_chains: leftovers.length, loops, unplaced: stops.filter((s) => !s.leg_id).length }
  return { stops, hops, stats }
}

// ── run ──────────────────────────────────────────────────────────────────────
let cq = (q) => q.eq('source', 'unols_mfp').not('operating_area_geojson', 'is', null)
if (onlySlug) cq = ((inner) => (q) => inner(q).eq('slug', onlySlug))(cq)
const cruises = await fetchAll('cruises', 'id, slug, operating_area_geojson', cq)
const legs = await fetchAll('cruise_legs', 'id, cruise_id, seq, depart_port, depart_lat, depart_lon, arrive_port, arrive_lat, arrive_lon')
const legsBy = new Map()
for (const l of legs) { if (!legsBy.has(l.cruise_id)) legsBy.set(l.cruise_id, []); legsBy.get(l.cruise_id).push(l) }
for (const v of legsBy.values()) v.sort((a, b) => a.seq - b.seq)

const batch = limit ? cruises.slice(0, limit) : cruises
const totals = { cruises: 0, stops: 0, hops: 0, unplaced: 0, extra_chains: 0, loops: 0, synthetic: 0, noRoute: 0 }
let written = 0, errors = 0
for (const c of batch) {
  const { stops, hops, stats } = plan(c, legsBy.get(c.id) ?? [])
  totals.cruises++; totals.stops += stats.stops; totals.hops += stats.hops; totals.unplaced += stats.unplaced; totals.extra_chains += stats.extra_chains; totals.loops += stats.loops; totals.synthetic += stats.synthetic
  if (stats.hops === 0) totals.noRoute++
  if (onlySlug || (dryRun && totals.cruises <= 3)) {
    console.log(`\n${c.slug}:`, stats)
    stops.forEach((s, i) => console.log(`  stop ${i + 1} ${s.kind.padEnd(8)} ${(s.name ?? '—').padEnd(24)} ${s.lat.toFixed(3)}, ${s.lon.toFixed(3)} ${s.station_hours != null ? s.station_hours + ' h' : ''} leg=${s.leg_id ? 'yes' : 'null'}`))
    hops.forEach((h, i) => console.log(`  hop  ${i + 1} ${(h.from.name ?? h.from.kind)} → ${(h.to.name ?? h.to.kind)}  ${h.hours != null ? Math.round(h.hours) + ' h' : '?'} @ ${h.speed_kn ?? '?'} kn${h.track ? ` · ${h.track.coordinates.length} pts` : ''}`))
  }
  if (dryRun) continue

  // rewrite this cruise's stops + hops
  const del = await supabase.from('cruise_stops').delete().eq('cruise_id', c.id) // hops cascade
  if (del.error) { console.error(`${c.slug}: delete failed: ${del.error.message}`); errors++; continue }
  if (stops.length === 0) continue
  const { data: ins, error: e1 } = await supabase.from('cruise_stops').insert(stops.map((s, i) => ({
    cruise_id: c.id, leg_id: s.leg_id ?? null, seq: i + 1, kind: s.kind, name: s.name, lat: s.lat, lon: s.lon,
    station_hours: s.station_hours, depth_m: s.depth_m, external_id: s.external_id,
  }))).select('id, seq')
  if (e1) { console.error(`${c.slug}: stops insert failed: ${e1.message}`); errors++; continue }
  const idBySeq = new Map(ins.map((r) => [r.seq, r.id]))
  const idOf = (s) => idBySeq.get(stops.indexOf(s) + 1)
  if (hops.length) {
    const { error: e2 } = await supabase.from('cruise_hops').insert(hops.map((h, i) => ({
      cruise_id: c.id, from_stop_id: idOf(h.from), to_stop_id: idOf(h.to), seq: i + 1, hours: h.hours, speed_kn: h.speed_kn, track: h.track, external_id: h.external_id,
    })))
    if (e2) { console.error(`${c.slug}: hops insert failed: ${e2.message}`); errors++; continue }
  }
  written++
  if (written % 100 === 0) console.log(`[${written}/${batch.length}]`)
}
console.log(`\n${dryRun ? 'DRY RUN' : 'Done'}:`, totals, dryRun ? '' : `written ${written}, errors ${errors}`)
if (errors) process.exitCode = 1
