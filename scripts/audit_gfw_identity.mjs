/**
 * Audit GFW identity mappings. Read-only — makes no DB changes.
 *
 * For each vessel with vessel_id_gfw, fetches the GFW identity record and
 * reports:
 *   NAME_MISMATCH — GFW's self-reported ship name differs from ours
 *                   (likely a reassigned/shared MMSI matched to the wrong hull)
 *   STALE         — the identity segment stopped transmitting > 1 year ago
 *                   (vessel may have a newer GFW id we're not querying)
 *
 * Usage:
 *   node scripts/audit_gfw_identity.mjs [--limit=N] [--out=path.csv]
 */
import dotenv from 'dotenv'
dotenv.config({ path: '.env.local' })
import { createClient } from '@supabase/supabase-js'
import { writeFileSync } from 'fs'

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL,
  process.env.SUPABASE_SERVICE_ROLE_KEY
)

const GFW_API_BASE = 'https://gateway.api.globalfishingwatch.org/v3'
const limitArg = process.argv.find((a) => a.startsWith('--limit='))
const limit = limitArg ? parseInt(limitArg.split('=')[1], 10) : null
const outArg = process.argv.find((a) => a.startsWith('--out='))
const outPath = outArg ? outArg.split('=')[1] : 'gfw_identity_audit.csv'

const sleep = (ms) => new Promise((r) => setTimeout(r, ms))
// Keep in sync with lib/gfw-sync-core.mjs: strip diacritics, R/V-style
// prefixes, and punctuation; containment (abbreviations) is not a mismatch.
const normName = (s) => (s ?? '')
  .normalize('NFD').replace(/\p{M}+/gu, '')
  .toUpperCase()
  .replace(/Ø/g, 'O').replace(/Æ/g, 'AE').replace(/Œ/g, 'OE').replace(/ß/gi, 'SS')
  .replace(/^(R\/?V|RRS|NOAAS?|FS|M\/?V|F\/?V|NRV|RS)\b[.\s]*/, '')
  .replace(/[^A-Z0-9]+/g, '')
const isRealMismatch = (a, b) => {
  const na = normName(a), nb = normName(b)
  return !!na && !!nb && na !== nb && !na.includes(nb) && !nb.includes(na)
}
const csvCell = (v) => {
  const s = String(v ?? '')
  return /[",\n]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s
}

async function main() {
  const apiKey = process.env.GLOBAL_FISHING_WATCH_API_KEY
  if (!apiKey) { console.error('GLOBAL_FISHING_WATCH_API_KEY not set'); process.exit(1) }

  let query = supabase
    .from('vessels')
    .select('id, name, mmsi, vessel_id_gfw')
    .not('vessel_id_gfw', 'is', null)
    .order('id')
  if (limit) query = query.limit(limit)
  const { data: vessels, error } = await query
  if (error) { console.error(error); process.exit(1) }

  console.log(`Auditing ${vessels.length} GFW identity mappings…`)
  const rows = []
  let errors = 0

  for (const v of vessels) {
    let info
    try {
      const res = await fetch(
        `${GFW_API_BASE}/vessels/${v.vessel_id_gfw}?dataset=public-global-vessel-identity:latest`,
        { headers: { Authorization: `Bearer ${apiKey}` } }
      )
      if (!res.ok) throw new Error(`GFW API ${res.status}`)
      info = await res.json()
    } catch (e) {
      console.error(`  [${v.id}] ${v.name}: ${e.message}`)
      errors++
      await sleep(300)
      continue
    }

    // The mapped id corresponds to one self-reported identity segment; find it
    // (fall back to the most recent segment on the record).
    const segments = info.selfReportedInfo ?? []
    const seg = segments.find((s) => s.id === v.vessel_id_gfw)
      ?? segments.sort((a, b) => (b.transmissionDateTo ?? '').localeCompare(a.transmissionDateTo ?? ''))[0]
    const gfwName = seg?.shipname ?? (info.registryInfo ?? [])[0]?.shipname ?? null
    const lastTx = seg?.transmissionDateTo ?? null

    const flags = []
    if (isRealMismatch(gfwName, v.name)) flags.push('NAME_MISMATCH')
    if (lastTx && Date.now() - new Date(lastTx).getTime() > 365 * 86400000) flags.push('STALE')

    rows.push({
      vessel_id: v.id,
      db_name: v.name,
      mmsi: v.mmsi,
      gfw_id: v.vessel_id_gfw,
      gfw_name: gfwName,
      gfw_ssvid: seg?.ssvid ?? null,
      last_transmission: lastTx,
      flags: flags.join('+'),
    })
    if (flags.length > 0) {
      console.log(`  [${v.id}] ${v.name} → GFW "${gfwName}" (last tx ${lastTx?.slice(0, 10)}) ${flags.join(' ')}`)
    }
    await sleep(300)
  }

  const header = Object.keys(rows[0] ?? { vessel_id: '' })
  const csv = [header.join(','), ...rows.map((r) => header.map((h) => csvCell(r[h])).join(','))].join('\n')
  writeFileSync(outPath, csv)

  const mismatches = rows.filter((r) => r.flags.includes('NAME_MISMATCH')).length
  const stale = rows.filter((r) => r.flags.includes('STALE')).length
  console.log(`\nDone. ${rows.length} audited → ${outPath}`)
  console.log(`  Name mismatches: ${mismatches}`)
  console.log(`  Stale (no transmission in >1yr): ${stale}`)
  console.log(`  Errors: ${errors}`)
}

main().catch((e) => { console.error(e); process.exit(1) })
