/**
 * Backfill cruise_equipment from the harvested MFP SME forms stored on
 * projects.raw.sme.equipment: "Ship Fitted Equipment" and "Pooled and
 * Portable Equipment" checkbox labels, plus the science-van count. Labels are
 * kept as printed; equipment_type_id is filled from the LABEL_TYPE map below.
 * Co-scheduled projects repeat the same gear: rows are unique per (cruise, label).
 *
 *   node scripts/backfill_cruise_equipment.mjs --dry-run
 *   node scripts/backfill_cruise_equipment.mjs            # replaces source='unols_mfp_sme' rows
 */
import dotenv from 'dotenv'
dotenv.config({ path: '.env.local' })
import { createClient } from '@supabase/supabase-js'

const supabase = createClient(process.env.NEXT_PUBLIC_SUPABASE_URL, process.env.SUPABASE_SERVICE_ROLE_KEY)
const dryRun = process.argv.includes('--dry-run')

// SME label → equipment_types.name (null = keep label, no type)
const LABEL_TYPE = {
  // ship fitted
  'Stern A-Frame': 'A-frame',
  'Ship Fitted Winches & Wires': 'Winches',
  'Meteorological Data': 'Meteorological station',
  'Crane': 'Crane',
  'Underway Seawater System': 'Underway seawater system',
  'Dynamic Positioning (DP)': 'Dynamic positioning',
  'Navigation - Heading/Position': 'GPS navigation',
  'pCO2': 'pCO2 system',
  'Overboarding Cable - Fiber Optic': 'Cable',
  'Overboarding Cable - Copper Conductor(s)': 'Cable',
  'Pinger, 12kHz': 'Beacon locators',
  'Ultra-Short Base-Line Acoustic Navigation System': 'Acoustic positioning',
  'SCUBA': 'Diving equipment',
  'Science (Wave/Ice) Radar': 'Radar',
  'Gravimeter': 'Gravity',
  'Sub-bottom Profiler': 'Sub bottom profiler',
  'Acoustic Centerboard/Drop Keel/Transducer Pole': 'Frame',
  // pooled / portable
  'CTD': 'CTD',
  'Winch Pool Portable Winch': 'Winches',
  'Science Supplied Portable Winch': 'Winches',
  'Sediment Core': 'Corer',
  'Grab Sampler': 'Sediment Grab',
  'XBT': 'XBT',
  'Portable Laboratory Vans/Containers - Science Supplied': 'Laboratory container',
  'Portable Laboratory Van(s) - NSF Van Pool': 'Laboratory container',
  'Other Seafloor Sampling Equipment': null,
  'Gyrocompass': 'Compasses',
  'Other ROV': 'ROV',
  'Other AUV': 'AUV',
  'Isaacs Kidd Midwater Trawl (IKMT)': 'Pelagic trawl',
  'MOC-1': 'Plankton Net',
  'MOC-10': 'Plankton Net',
  'Towed or Vertical Net System': 'Plankton Net',
  'WHOI MISO Camera System': 'Underwater Camera',
  'TowCam': 'Underwater Camera',
  'Magnetometer (towed)': 'Magnetics',
  'Dredge': 'Dredge',
  'Ocean Bottom Seismometers - Other': 'Ocean bottom seismometer',
  'Ocean Bottom Seismometers - OBSIC': 'Ocean bottom seismometer',
  'Uncrewed Aerial System (UAS)': 'UAS',
  'Portable Seismic System': 'Seismic system',
  'McLane WTS-LV': 'In-Situ Pump',
  'Ocean Data Facility (ODF)': null,
  'Sidescan/CHIRP system': 'Side scan',
  'ScanFish': 'Towed CTD',
  'Mooring instrumentation': 'Mooring Instrumentation',
  'Fluorometer': 'Sensor',
  'Science-provided vans': 'Laboratory container',
}
// prefix matches for the families with variants
const PREFIX_TYPE = [
  ['ADCP/UHDAS', 'ADCP'], ['HDSS', 'ADCP'],
  ['Multibeam', 'Multibeam echo sounder'],
  ['Echosounder', 'Echo sounder system'], ['Biological multi-frequency echosounder', 'Echo sounder system'],
]
const SKIP = new Set(['', 'This cruise will deploy or recover moorings.'])
const SCIENCE_SUPPLIED = /science supplied/i

async function fetchAll(table, cols, filter = (q) => q) {
  const out = []
  for (let from = 0; ; from += 1000) {
    const { data, error } = await filter(supabase.from(table).select(cols)).range(from, from + 999)
    if (error) throw error
    out.push(...data)
    if (data.length < 1000) return out
  }
}
const types = new Map((await fetchAll('equipment_types', 'id, name')).map((t) => [t.name, t.id]))
const typeFor = (label) => {
  const name = label in LABEL_TYPE ? LABEL_TYPE[label] : PREFIX_TYPE.find(([p]) => label.startsWith(p))?.[1]
  if (name && !types.has(name)) console.warn(`type not found: ${name}`)
  return name ? types.get(name) ?? null : null
}

const projects = await fetchAll('projects', 'cruise_id, raw', (q) => q.not('raw->sme', 'is', null))
const rows = new Map() // `${cruise_id}|${label}` -> row
const unmapped = new Map()
for (const p of projects) {
  const eq = p.raw?.sme?.equipment
  if (!eq) continue
  const add = (label, provided_by, quantity = null) => {
    label = (label || '').trim()
    if (SKIP.has(label)) return
    const key = `${p.cruise_id}|${label}`
    if (rows.has(key)) return
    const equipment_type_id = typeFor(label)
    if (!equipment_type_id && !(label in LABEL_TYPE)) unmapped.set(label, (unmapped.get(label) || 0) + 1)
    rows.set(key, { cruise_id: p.cruise_id, label, equipment_type_id, provided_by, quantity, source: 'unols_mfp_sme' })
  }
  for (const l of eq.ship_fitted ?? []) add(l, 'ship')
  for (const l of eq.pooled_portable ?? []) add(l, SCIENCE_SUPPLIED.test(l) ? 'science_party' : 'pool')
  if (eq.vans > 0) add('Science-provided vans', 'science_party', eq.vans)
}
const out = [...rows.values()]
console.log(`projects with forms ${projects.length} → ${out.length} cruise_equipment rows on ${new Set(out.map((r) => r.cruise_id)).size} cruises; typed ${out.filter((r) => r.equipment_type_id).length}`)
if (unmapped.size) console.log('  unmapped labels:', Object.fromEntries(unmapped))
if (dryRun) { console.log('dry run — nothing written'); process.exit(0) }

const { error: delErr } = await supabase.from('cruise_equipment').delete().eq('source', 'unols_mfp_sme')
if (delErr) throw delErr
let written = 0
for (let i = 0; i < out.length; i += 500) {
  const { error, data } = await supabase.from('cruise_equipment').insert(out.slice(i, i + 500)).select('id')
  if (error) { console.error(`chunk ${i}: ${error.message}`); process.exitCode = 1; continue }
  written += data.length
}
console.log(`Done: ${written} rows written`)
