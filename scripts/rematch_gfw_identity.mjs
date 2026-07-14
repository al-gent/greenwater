/**
 * Re-match vessels to GFW identities from scratch. Read-only — proposes
 * corrections as a CSV for review; applies nothing.
 *
 * Background: the original ITU MARS scrape (data_scraping/itu_lookup.py) had a
 * race — the results table was read before the new search rendered, so many
 * mmsi_results.csv rows pair a vessel_id with the PREVIOUS vessel's lookup.
 * Our call signs are trustworthy; the mmsi/vessel_id_gfw derived from that
 * file are not.
 *
 * Strategy per vessel (active, with a call sign or name):
 *   1. GFW /vessels/search by call sign → candidates whose callsign equals ours
 *   2. fallback: search by name → candidates whose normalized name matches
 *   3. rank candidates: name match > flag match > latest transmission
 * Confidence tiers:
 *   CALLSIGN+NAME   callsign and name both match          — safe to auto-apply
 *   CALLSIGN+FLAG   callsign + flag match, name differs   — likely renamed; review
 *   CALLSIGN        callsign only                          — review
 *   NAME+FLAG       name + flag match (no callsign match)  — review
 *   NAME            name only                              — review carefully
 *
 * Usage:
 *   node scripts/rematch_gfw_identity.mjs [--limit=N] [--out=path.csv]
 */
import dotenv from 'dotenv'
dotenv.config({ path: '.env.local' })
import { createClient } from '@supabase/supabase-js'
import { writeFileSync } from 'fs'

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL,
  process.env.SUPABASE_SERVICE_ROLE_KEY
)

const GFW_SEARCH = 'https://gateway.api.globalfishingwatch.org/v3/vessels/search'
const limitArg = process.argv.find((a) => a.startsWith('--limit='))
const limit = limitArg ? parseInt(limitArg.split('=')[1], 10) : null
const outArg = process.argv.find((a) => a.startsWith('--out='))
const outPath = outArg ? outArg.split('=')[1] : 'gfw_rematch_proposals.csv'

const sleep = (ms) => new Promise((r) => setTimeout(r, ms))

// Keep in sync with lib/gfw-sync-core.mjs
const normName = (s) => (s ?? '')
  .normalize('NFD').replace(/\p{M}+/gu, '')
  .toUpperCase()
  .replace(/Ø/g, 'O').replace(/Æ/g, 'AE').replace(/Œ/g, 'OE').replace(/ß/gi, 'SS')
  .replace(/^(R\/?V|RRS|NOAAS?|FS|M\/?V|F\/?V|NRV|RS)\b[.\s]*/, '')
  .replace(/[^A-Z0-9]+/g, '')
const namesMatch = (a, b) => {
  const na = normName(a), nb = normName(b)
  return !!na && !!nb && (na === nb || na.includes(nb) || nb.includes(na))
}
const normCallsign = (s) => (s ?? '').toUpperCase().replace(/[\s\-]/g, '')

// DB country name → ISO3 flag (covering the fleet's countries)
const COUNTRY_TO_ISO3 = {
  'argentina': 'ARG', 'australia': 'AUS', 'bahamas': 'BHS', 'belgium': 'BEL',
  'bermuda': 'BMU', 'brazil': 'BRA', 'bulgaria': 'BGR', 'canada': 'CAN',
  'chile': 'CHL', 'china': 'CHN', 'colombia': 'COL', 'cook islands': 'COK',
  'croatia': 'HRV', 'cyprus': 'CYP', 'denmark': 'DNK', 'ecuador': 'ECU',
  'egypt': 'EGY', 'estonia': 'EST', 'faroe islands': 'FRO', 'finland': 'FIN',
  'france': 'FRA', 'germany': 'DEU', 'greece': 'GRC', 'greenland': 'GRL',
  'iceland': 'ISL', 'india': 'IND', 'indonesia': 'IDN', 'ireland': 'IRL',
  'israel': 'ISR', 'italy': 'ITA', 'japan': 'JPN', 'kenya': 'KEN',
  'korea': 'KOR', 'south korea': 'KOR', 'latvia': 'LVA', 'lithuania': 'LTU',
  'malaysia': 'MYS', 'malta': 'MLT', 'marshall islands': 'MHL', 'mexico': 'MEX',
  'monaco': 'MCO', 'mozambique': 'MOZ', 'namibia': 'NAM', 'netherlands': 'NLD',
  'new zealand': 'NZL', 'nigeria': 'NGA', 'norway': 'NOR', 'panama': 'PAN',
  'peru': 'PER', 'philippines': 'PHL', 'poland': 'POL', 'portugal': 'PRT',
  'romania': 'ROU', 'russia': 'RUS', 'saudi arabia': 'SAU', 'singapore': 'SGP',
  'south africa': 'ZAF', 'spain': 'ESP', 'sweden': 'SWE', 'taiwan': 'TWN',
  'thailand': 'THA', 'turkey': 'TUR', 'uk': 'GBR', 'united kingdom': 'GBR',
  'ukraine': 'UKR', 'united states': 'USA', 'usa': 'USA', 'uruguay': 'URY',
  'vanuatu': 'VUT',
}

async function gfwSearch(apiKey, query) {
  const params = new URLSearchParams({
    'query': query,
    'datasets[0]': 'public-global-vessel-identity:latest',
  })
  const res = await fetch(`${GFW_SEARCH}?${params}`, {
    headers: { Authorization: `Bearer ${apiKey}` },
  })
  if (!res.ok) throw new Error(`GFW API ${res.status}`)
  const json = await res.json()
  // Flatten to self-reported identity segments (these ids work with /events)
  const segs = []
  for (const entry of json.entries ?? []) {
    for (const info of entry.selfReportedInfo ?? []) segs.push(info)
  }
  return segs
}

// Rank: name match, then flag match, then latest transmission
function pickBest(candidates, vesselName, iso3) {
  return candidates.sort((a, b) => {
    const an = namesMatch(a.shipname, vesselName) ? 1 : 0
    const bn = namesMatch(b.shipname, vesselName) ? 1 : 0
    if (an !== bn) return bn - an
    const af = iso3 && a.flag === iso3 ? 1 : 0
    const bf = iso3 && b.flag === iso3 ? 1 : 0
    if (af !== bf) return bf - af
    return (b.transmissionDateTo ?? '').localeCompare(a.transmissionDateTo ?? '')
  })[0]
}

async function main() {
  const apiKey = process.env.GLOBAL_FISHING_WATCH_API_KEY
  if (!apiKey) { console.error('GLOBAL_FISHING_WATCH_API_KEY not set'); process.exit(1) }

  let query = supabase
    .from('vessels')
    .select('id, name, country, call_sign, mmsi, vessel_id_gfw')
    .eq('status', 'active')
    .order('id')
  if (limit) query = query.limit(limit)
  const { data: vessels, error } = await query
  if (error) { console.error(error); process.exit(1) }

  console.log(`Re-matching ${vessels.length} active vessels against GFW…`)
  const rows = []
  let errors = 0

  for (const [i, v] of vessels.entries()) {
    if (i > 0 && i % 50 === 0) console.log(`  …${i}/${vessels.length}`)
    const iso3 = COUNTRY_TO_ISO3[(v.country ?? '').toLowerCase().trim()] ?? null
    const cs = normCallsign(v.call_sign)

    let best = null
    let basis = null
    try {
      if (cs) {
        const segs = (await gfwSearch(apiKey, cs)).filter((s) => normCallsign(s.callsign) === cs)
        await sleep(250)
        if (segs.length > 0) {
          best = pickBest(segs, v.name, iso3)
          basis = namesMatch(best.shipname, v.name)
            ? 'CALLSIGN+NAME'
            : (iso3 && best.flag === iso3 ? 'CALLSIGN+FLAG' : 'CALLSIGN')
        }
      }
      if (!best && v.name) {
        const segs = (await gfwSearch(apiKey, v.name)).filter((s) => namesMatch(s.shipname, v.name))
        await sleep(250)
        if (segs.length > 0) {
          best = pickBest(segs, v.name, iso3)
          basis = iso3 && best.flag === iso3 ? 'NAME+FLAG' : 'NAME'
        }
      }
    } catch (e) {
      console.error(`  [${v.id}] ${v.name}: ${e.message}`)
      errors++
      await sleep(1000)
      continue
    }

    const status = !best
      ? (v.vessel_id_gfw ? 'LOST' : 'NO_MATCH')
      : !v.vessel_id_gfw
        ? 'NEW'
        : best.id === v.vessel_id_gfw ? 'UNCHANGED' : 'CHANGED'

    rows.push({
      vessel_id: v.id,
      name: v.name,
      country: v.country,
      call_sign: v.call_sign,
      current_mmsi: v.mmsi,
      current_gfw_id: v.vessel_id_gfw,
      proposed_mmsi: best?.ssvid ?? null,
      proposed_gfw_id: best?.id ?? null,
      proposed_name: best?.shipname ?? null,
      proposed_flag: best?.flag ?? null,
      proposed_callsign: best?.callsign ?? null,
      last_transmission: best?.transmissionDateTo ?? null,
      match_basis: basis,
      status,
    })
  }

  const csvCell = (x) => {
    const s = String(x ?? '')
    return /[",\n]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s
  }
  const header = Object.keys(rows[0])
  writeFileSync(outPath, [header.join(','), ...rows.map((r) => header.map((h) => csvCell(r[h])).join(','))].join('\n'))

  const by = (k, val) => rows.filter((r) => r[k] === val).length
  console.log(`\nDone. ${rows.length} vessels → ${outPath}`)
  console.log(`  UNCHANGED: ${by('status', 'UNCHANGED')}`)
  console.log(`  CHANGED:   ${by('status', 'CHANGED')}`)
  console.log(`  NEW:       ${by('status', 'NEW')} (previously unmatched, match found)`)
  console.log(`  LOST:      ${by('status', 'LOST')} (currently matched, nothing found now)`)
  console.log(`  NO_MATCH:  ${by('status', 'NO_MATCH')}`)
  console.log(`  Errors:    ${errors}`)
  console.log('\nBy match basis:')
  for (const b of ['CALLSIGN+NAME', 'CALLSIGN+FLAG', 'CALLSIGN', 'NAME+FLAG', 'NAME']) {
    console.log(`  ${b}: ${by('match_basis', b)}`)
  }
}

main().catch((e) => { console.error(e); process.exit(1) })
