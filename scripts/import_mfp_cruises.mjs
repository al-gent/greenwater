/**
 * Import UNOLS/MFP cruise history into cruises + cruise_legs.
 *
 * Reads the raw pulls in mfp-api/raw/ (see mfp-api/README.md) — this is the
 * one-time seed from the 2026-09-17 snapshot, not the live sync. Idempotent:
 * matches on (source='unols_mfp', external_id=CruiseApplication_id), updates
 * existing rows, replaces their legs.
 *
 * Usage:
 *   node scripts/import_mfp_cruises.mjs --dry-run      # report only
 *   node scripts/import_mfp_cruises.mjs --limit=20     # first N records
 *   node scripts/import_mfp_cruises.mjs                # full import
 */
import dotenv from 'dotenv'
dotenv.config({ path: '.env.local' })
import fs from 'fs'
import path from 'path'
import { createClient } from '@supabase/supabase-js'

const supabase = createClient(process.env.NEXT_PUBLIC_SUPABASE_URL, process.env.SUPABASE_SERVICE_ROLE_KEY)

const dryRun = process.argv.includes('--dry-run')
const limitArg = process.argv.find((a) => a.startsWith('--limit='))
const limit = limitArg ? parseInt(limitArg.split('=')[1], 10) : undefined

const RAW = path.join(process.cwd(), 'mfp-api', 'raw')
const read = (f) => JSON.parse(fs.readFileSync(path.join(RAW, f), 'utf8'))

// ── helpers ──────────────────────────────────────────────────────────────────
const strip = (s) => (typeof s === 'string' ? s.replace(/<[^>]+>/g, '').replace(/\s+/g, ' ').trim() : s)
const norm = (s) => (s || '').toLowerCase().replace(/^(r\/v|rv|uscgc)\s+/, '').replace(/[^a-z0-9]/g, '')

// MFP dates come two ways: ISO ('2026-05-14T16:00:00Z') on legs, and US 'M/D/YYYY'
// on the Cruise.Start/End block. Both → ISO string or null.
function toIso(s) {
  if (!s) return null
  if (/^\d{4}-\d{2}-\d{2}/.test(s)) return new Date(s).toISOString()
  const m = s.match(/^(\d{1,2})\/(\d{1,2})\/(\d{4})/)
  if (m) return new Date(Date.UTC(+m[3], +m[1] - 1, +m[2])).toISOString()
  return null
}

// The derived status ladder from mfp-api/README.md. Only "hide" affects import
// (those rows are imported but cancelled + unpublished).
function ladder(c) {
  const fs = new Set((c.DestinationFundings || []).map((f) => f.StatusDisplay || '(blank)'))
  if (fs.size === 0 || fs.has('Declined') || fs.has('Withdrawn') || fs.has('(blank)')) return 'hide'
  if (c.Cruise?.Start?.ActualDeparture) return 'sailed'
  if ((c.Ships?.length ?? 0) > 1 || fs.has('Pending')) return 'tentative'
  return c.Workflow?.AlternateReferenceNumber ? 'firm' : 'scheduled'
}

// Strip the MFP-internal noise off the GeoJSON so what we store is plain GeoJSON.
function cleanGeo(fc) {
  if (!fc) return null
  return {
    type: 'FeatureCollection',
    features: (fc.features || []).map((f) => ({
      type: 'Feature',
      geometry: { type: f.geometry.type, coordinates: f.geometry.coordinates },
      properties: Object.fromEntries(
        Object.entries(f.properties || {}).filter(([k]) => !['id', 'parent_id', 'CruiseApplication_id', 'Organisation_id', 'ActualOrganisation_id', 'Workflow_id'].includes(k)),
      ),
    })),
  }
}

// ── load ─────────────────────────────────────────────────────────────────────
const records = read('cruises-decoded.json')
const geoByApp = new Map(read('Read_CruiseApplicationGEOJson.json').map((fc) => [String(fc.properties.CruiseApplication_id), fc]))
const mfpVessels = read('vessels.json') // 21 ships: id '13_6', parent_id (org), name, ICES, MMSI

// LOCODE → coords, harvested from every LOCODE object in the data (legs carry codes only).
const locode = new Map()
for (const c of records) {
  for (const l of [c.Mobilisation, c.Demobilisation, c.Cruise?.Start?.DepartureLocation, c.Cruise?.Start?.ArrivalLocation, c.Cruise?.End?.DepartureLocation, c.Cruise?.End?.ArrivalLocation]) {
    if (l?.Key && l.Latitude != null) locode.set(l.Key, { lat: l.Latitude, lon: l.Longitude })
  }
}

const { data: orgs, error: orgErr } = await supabase.from('organizations').select('id, name, mfp_organisation_id').not('mfp_organisation_id', 'is', null)
if (orgErr) throw orgErr
const orgByMfp = new Map(orgs.map((o) => [o.mfp_organisation_id, o.id]))

// PostgREST caps responses at 1,000 rows server-side; page through.
async function fetchAll(table, cols, filter = (q) => q) {
  const out = []
  for (let from = 0; ; from += 1000) {
    const { data, error } = await filter(supabase.from(table).select(cols)).range(from, from + 999)
    if (error) throw error
    out.push(...data)
    if (data.length < 1000) return out
  }
}
const vessels = await fetchAll('vessels', 'id, name, mmsi, scientists, status, organization_id')
const vesselByMmsi = new Map(vessels.filter((v) => v.mmsi).map((v) => [v.mmsi, v]))
const vesselsByName = new Map()
for (const v of vessels) {
  const k = norm(v.name)
  if (!vesselsByName.has(k)) vesselsByName.set(k, [])
  vesselsByName.get(k).push(v)
}
function findVessel(name) {
  const cands = vesselsByName.get(norm(name)) || []
  // prefer active, then the one already linked to an org
  return cands.sort((a, b) => (a.status === 'active' ? 0 : 1) - (b.status === 'active' ? 0 : 1))[0] || null
}

// MFP vessel → our vessel (MMSI first, then name), plus the operator org it belongs to.
const vesselByMfpName = new Map()
const vesselOrg = new Map() // our vessel id → org uuid
for (const mv of mfpVessels) {
  const ours = (mv.MMSI && vesselByMmsi.get(mv.MMSI)) || findVessel(mv.name)
  if (ours) {
    vesselByMfpName.set(norm(mv.name), ours)
    const org = orgByMfp.get(parseInt(mv.parent_id, 10))
    if (org) vesselOrg.set(ours.id, org)
  } else console.warn(`vessel not found: ${mv.name} (MMSI ${mv.MMSI || '-'})`)
}
function resolveVessel(parkedName) {
  return vesselByMfpName.get(norm(parkedName)) || findVessel(parkedName)
}

// ── transform ────────────────────────────────────────────────────────────────
const seen = new Set()
const rows = []
const misses = { vessel: new Map(), org: new Map() }
for (const c of records) {
  const extId = String(c.CruiseApplication_id)
  if (seen.has(extId)) continue // one duplicated test record in the snapshot
  seen.add(extId)

  const parked = c.Cruise?.Start?.Voyage?.FlexLocation?.Name
  const vessel = resolveVessel(parked)
  if (!vessel) { misses.vessel.set(parked, (misses.vessel.get(parked) || 0) + 1); continue }
  const orgId = orgByMfp.get(c.Organisation_id)
  if (!orgId) { misses.org.set(c.Organisation_id, (misses.org.get(c.Organisation_id) || 0) + 1); continue }

  const legs = [...(c.Legs || [])].sort((a, b) => (a.Departure || '').localeCompare(b.Departure || ''))
  const departure = toIso(legs[0]?.Departure)
  const arrival = toIso(legs.map((l) => l.Arrival).sort().at(-1))
  if (!departure || !arrival) continue

  const status = ladder(c)
  const now = new Date().toISOString()
  rows.push({
    cruise: {
      organization_id: orgId,
      vessel_id: vessel.id,
      title: strip(c.ShortName) || strip(c.Name),
      cruise_code: c.Workflow?.AlternateReferenceNumber || null,
      summary: strip(c.ShortName) && strip(c.ShortName) !== strip(c.Name) ? strip(c.Name) : null,
      operating_area: strip(c.ScienceLocationGeneral) || null,
      operating_area_geojson: cleanGeo(geoByApp.get(extId)),
      mobilization_at: toIso(c.Cruise?.Start?.MobilisationDate),
      departure_at: departure,
      arrival_at: arrival < departure ? departure : arrival,
      demobilization_at: toIso(c.Cruise?.End?.DemobilisationDate),
      actual_departure_at: toIso(c.Cruise?.Start?.ActualDeparture),
      actual_arrival_at: toIso(c.Cruise?.End?.ActualArrival),
      science_party_size: null,
      berths_total: vessel.scientists ?? null,
      berths_open: null,
      cancelled_at: status === 'hide' ? now : null,
      published_at: status === 'hide' ? null : now,
      source: 'unols_mfp',
      external_id: extId,
      external_refs: {
        workflow_id: c.Workflow_id,
        voyage_event_id: c.Cruise?.VoyageEvent_id,
        cruise_id: c.Cruise_id,
        reference_number: c.Workflow?.ReferenceNumber,
        organisation_id: c.Organisation_id,
        derived_status: status,
      },
      raw: c,
      synced_at: now,
    },
    legs: legs.map((l, i) => {
      const dep = l.DepartNameCountryCode && l.DepartNameLocationCode ? `${l.DepartNameCountryCode}${l.DepartNameLocationCode}` : null
      const arr = l.NameCountryCode && l.NameLocationCode ? `${l.NameCountryCode}${l.NameLocationCode}` : null
      const da = toIso(l.Departure), aa = toIso(l.Arrival)
      return {
        seq: i + 1,
        depart_port: strip(l.DepartName) || '—',
        depart_unlocode: dep,
        depart_lat: locode.get(dep)?.lat ?? null,
        depart_lon: locode.get(dep)?.lon ?? null,
        depart_at: da,
        arrive_port: strip(l.Name) || '—',
        arrive_unlocode: arr,
        arrive_lat: locode.get(arr)?.lat ?? null,
        arrive_lon: locode.get(arr)?.lon ?? null,
        arrive_at: aa < da ? da : aa,
        external_id: String(l.Destination_id),
      }
    }),
  })
}

const batch = limit ? rows.slice(0, limit) : rows
console.log(`records ${records.length} → importable ${rows.length} (importing ${batch.length})`)
console.log(`  vessel misses:`, Object.fromEntries(misses.vessel))
console.log(`  org misses:`, Object.fromEntries(misses.org))
console.log(`  status:`, batch.reduce((a, r) => ((a[r.cruise.external_refs.derived_status] = (a[r.cruise.external_refs.derived_status] || 0) + 1), a), {}))
console.log(`  legs: ${batch.reduce((n, r) => n + r.legs.length, 0)}, legs with coords both ends: ${batch.reduce((n, r) => n + r.legs.filter((l) => l.depart_lat != null && l.arrive_lat != null).length, 0)}`)
console.log(`  vessels.organization_id to set: ${vesselOrg.size}`)
if (dryRun) { console.log('dry run — nothing written'); process.exit(0) }

// ── write ────────────────────────────────────────────────────────────────────
// Link ARF vessels to their operator org (only where not already set).
for (const [vesselId, orgId] of vesselOrg) {
  const { error } = await supabase.from('vessels').update({ organization_id: orgId }).eq('id', vesselId).is('organization_id', null)
  if (error) console.warn(`vessel ${vesselId} org link failed: ${error.message}`)
}

// Existing rows by external_id → update; others → insert. (Partial unique index
// on (source, external_id) so PostgREST upsert can't target it.)
const existing = await fetchAll('cruises', 'id, external_id', (q) => q.eq('source', 'unols_mfp'))
const idByExt = new Map(existing.map((r) => [r.external_id, r.id]))

let inserted = 0, updated = 0, legsWritten = 0, errors = 0
const CHUNK = 100
const toInsert = batch.filter((r) => !idByExt.has(r.cruise.external_id))
const toUpdate = batch.filter((r) => idByExt.has(r.cruise.external_id))

for (let i = 0; i < toInsert.length; i += CHUNK) {
  const chunk = toInsert.slice(i, i + CHUNK)
  const { data, error } = await supabase.from('cruises').insert(chunk.map((r) => r.cruise)).select('id, external_id')
  if (error) { console.error(`insert chunk ${i}: ${error.message}`); errors++; continue }
  for (const d of data) idByExt.set(d.external_id, d.id)
  inserted += data.length
}
for (const r of toUpdate) {
  const { error } = await supabase.from('cruises').update(r.cruise).eq('id', idByExt.get(r.cruise.external_id))
  if (error) { console.error(`update ${r.cruise.external_id}: ${error.message}`); errors++; continue }
  updated++
}

// Legs: replace per cruise.
const ids = batch.map((r) => idByExt.get(r.cruise.external_id)).filter(Boolean)
for (let i = 0; i < ids.length; i += CHUNK) {
  const { error } = await supabase.from('cruise_legs').delete().in('cruise_id', ids.slice(i, i + CHUNK))
  if (error) { console.error(`legs delete chunk ${i}: ${error.message}`); errors++ }
}
const legRows = batch.flatMap((r) => {
  const cruise_id = idByExt.get(r.cruise.external_id)
  return cruise_id ? r.legs.map((l) => ({ ...l, cruise_id })) : []
})
for (let i = 0; i < legRows.length; i += CHUNK * 5) {
  const chunk = legRows.slice(i, i + CHUNK * 5)
  const { error } = await supabase.from('cruise_legs').insert(chunk)
  if (error) { console.error(`legs insert chunk ${i}: ${error.message}`); errors++; continue }
  legsWritten += chunk.length
}

console.log(`\nDone: cruises inserted ${inserted}, updated ${updated}; legs written ${legsWritten}; errors ${errors}`)
if (errors) process.exitCode = 1
