/**
 * One-time seed of `equipment` from the ARF public inventory snapshot on disk
 * (mfp-api/raw/public_equipment_inventory.json, 1,013 items). Not a sync.
 *
 *   node scripts/import_mfp_equipment.mjs --dry-run
 *   node scripts/import_mfp_equipment.mjs
 *
 * Matches organizations via organizations.mfp_organisation_id. BaseLocation ("Ship  ->  <name>"
 * or "<org>  ->  <place>") becomes the unit's one open equipment_locations row; existing open
 * rows are left alone (they may have been moved since). Idempotent on (source, external_id) —
 * the unique index is partial, so PostgREST upsert can't target it; existing rows update by id.
 */
import dotenv from 'dotenv'
dotenv.config({ path: '.env.local' })
import fs from 'fs'
import path from 'path'
import { createClient } from '@supabase/supabase-js'

const supabase = createClient(process.env.NEXT_PUBLIC_SUPABASE_URL, process.env.SUPABASE_SERVICE_ROLE_KEY)
const dryRun = process.argv.includes('--dry-run')

const raw = JSON.parse(fs.readFileSync(path.join(process.cwd(), 'mfp-api', 'raw', 'public_equipment_inventory.json'), 'utf8'))
const items = Array.isArray(raw) ? raw : raw.data ?? Object.values(raw)[0]
const norm = (s) => (s || '').toLowerCase().replace(/^(r\/v|rv)\s+/, '').replace(/[^a-z0-9]/g, '')

async function fetchAll(table, cols) {
  const out = []
  for (let from = 0; ; from += 1000) {
    const { data, error } = await supabase.from(table).select(cols).range(from, from + 999)
    if (error) throw error
    out.push(...data)
    if (data.length < 1000) return out
  }
}
const [orgs, vessels, types] = await Promise.all([
  fetchAll('organizations', 'id, mfp_organisation_id'),
  fetchAll('vessels', 'id, name, status'),
  fetchAll('equipment_types', 'id, name'),
])
const orgByMfp = new Map(orgs.filter((o) => o.mfp_organisation_id != null).map((o) => [o.mfp_organisation_id, o.id]))
const typeByName = new Map(types.map((t) => [t.name.trim().toLowerCase(), t.id]))
const vesselByName = new Map()
for (const v of vessels.sort((a, b) => (a.status === 'active' ? 0 : 1) - (b.status === 'active' ? 0 : 1))) {
  if (!vesselByName.has(norm(v.name))) vesselByName.set(norm(v.name), v.id)
}

const misses = { org: new Set(), vessel: new Set(), type: new Set() }
const rows = items.map((it) => {
  const ship = /^Ship\s*->\s*(.+)$/.exec(it.BaseLocation || '')?.[1]?.trim()
  const vessel_id = ship ? vesselByName.get(norm(ship)) ?? null : null
  if (ship && !vessel_id) misses.vessel.add(ship)
  const organization_id = orgByMfp.get(it.Organisation_id) ?? null
  if (!organization_id) misses.org.add(`${it.Organisation_id} ${it.Institution}`)
  const equipment_type_id = typeByName.get((it.Type || '').trim().toLowerCase()) ?? null
  if (!equipment_type_id) misses.type.add(it.Type)
  return {
    unit: {
      equipment_type_id, organization_id,
      name: (it.Name || '').trim() || it.Type,
      model: it.ModelNumber || null,
      manufacturer: it.Manufacturer || null,
      group_name: it.Group || null,
      source: 'unols_mfp_inventory',
      external_id: String(it.Equipment_id),
    },
    location: vessel_id
      ? { vessel_id, organization_id }
      : { organization_id, place: (it.BaseLocation || '').split('->').pop()?.trim() || null },
  }
})
console.log(`items ${items.length}: aboard a vessel ${rows.filter((r) => r.location.vessel_id).length}`)
for (const [k, v] of Object.entries(misses)) if (v.size) console.log(`  ${k} misses:`, [...v])
if (dryRun) { console.log('dry run — nothing written'); process.exit(0) }

const existing = await fetchAll('equipment', 'id, external_id')
const idByExt = new Map(existing.filter((e) => e.external_id).map((e) => [e.external_id, e.id]))
const toInsert = rows.filter((r) => !idByExt.has(r.unit.external_id))
const toUpdate = rows.filter((r) => idByExt.has(r.unit.external_id))
let inserted = 0, updated = 0
for (let i = 0; i < toInsert.length; i += 200) {
  const { error, data } = await supabase.from('equipment').insert(toInsert.slice(i, i + 200).map((r) => r.unit)).select('id, external_id')
  if (error) { console.error(`insert chunk ${i}: ${error.message}`); process.exitCode = 1; continue }
  for (const d of data) idByExt.set(d.external_id, d.id)
  inserted += data.length
}
for (const r of toUpdate) {
  const { error } = await supabase.from('equipment').update(r.unit).eq('id', idByExt.get(r.unit.external_id))
  if (error) { console.error(`update ${r.unit.external_id}: ${error.message}`); process.exitCode = 1; continue }
  updated++
}

// Initial location: one open stay per unit that has none yet.
const open = new Set((await fetchAll('equipment_locations', 'equipment_id, to_at')).filter((l) => l.to_at == null).map((l) => l.equipment_id))
const locRows = rows.map((r) => ({ equipment_id: idByExt.get(r.unit.external_id), ...r.location, notes: 'Seeded from ARF inventory BaseLocation' }))
  .filter((l) => l.equipment_id && !open.has(l.equipment_id) && (l.vessel_id || l.organization_id || l.place))
let located = 0
for (let i = 0; i < locRows.length; i += 200) {
  const { error, data } = await supabase.from('equipment_locations').insert(locRows.slice(i, i + 200)).select('id')
  if (error) { console.error(`location chunk ${i}: ${error.message}`); process.exitCode = 1; continue }
  located += data.length
}
console.log(`Done: equipment inserted ${inserted}, updated ${updated}; locations seeded ${located}`)
