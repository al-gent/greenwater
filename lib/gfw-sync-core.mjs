/**
 * GFW port visit sync — single implementation shared by:
 *   • scripts/sync_gfw.mjs        (weekly GitHub Actions run / manual CLI)
 *   • app/api/admin/sync-gfw      (manual admin trigger, capped)
 *
 * Plain .mjs so Node can run it directly and the Next.js route can import it.
 * The caller supplies a Supabase client (service role) and the GFW API key.
 *
 * Modes:
 *   weekly (default) — fetch the `perVessel` most recent port visits per
 *     vessel, insert only events not already in port_calls.
 *   backfill — fetch each vessel's full port visit history and upsert
 *     everything, overwriting lat/lon with the end-anchorage position and
 *     clearing stale reverse-geocoded fields (they were derived from the
 *     event's start-anchorage position — see 20260714 migration notes).
 *
 * After either mode, a bounded geocode pass fills port_city/state/country on
 * each vessel's LATEST call only (that's all the UI reads geocoded fields
 * from) — never the full history, so Nominatim usage stays ~1 call per
 * vessel with a new port call.
 */

const GFW_API_BASE = 'https://gateway.api.globalfishingwatch.org/v3'
const GFW_DATASET = 'public-global-port-visits-c2-events:latest'
const GFW_LOITERING_DATASET = 'public-global-loitering-events:latest'

function sleep(ms) {
  return new Promise((r) => setTimeout(r, ms))
}

// Timestamps come back from Postgres as "+00:00" but from GFW as ".000Z" —
// normalize both sides so dedupe keys compare equal.
function tsKey(vesselId, ts) {
  return `${vesselId}|${new Date(ts).toISOString()}`
}

// Normalize a vessel name for comparison: strip diacritics, "R/V"-style
// prefixes, and all punctuation/spacing ("RRS James Cook" → "JAMESCOOK").
function normName(s) {
  return (s ?? '')
    .normalize('NFD').replace(/\p{M}+/gu, '')
    .toUpperCase()
    .replace(/Ø/g, 'O').replace(/Æ/g, 'AE').replace(/Œ/g, 'OE').replace(/ß/gi, 'SS')
    .replace(/^(R\/?V|RRS|NOAAS?|FS|M\/?V|F\/?V|NRV|RS)\b[.\s]*/, '')
    .replace(/[^A-Z0-9]+/g, '')
}

// True only when the names are substantively different — one containing the
// other (abbreviations, prefixes we didn't strip) doesn't count.
function isRealMismatch(a, b) {
  const na = normName(a)
  const nb = normName(b)
  if (!na || !nb) return false
  return na !== nb && !na.includes(nb) && !nb.includes(na)
}

// Nominatim reverse-geocode. Caller is responsible for the ~1 req/sec rate
// limit. Returns null on any error or unparseable response.
async function reverseGeocode(lat, lon) {
  try {
    const url = `https://nominatim.openstreetmap.org/reverse?lat=${lat}&lon=${lon}&format=json`
    const res = await fetch(url, {
      headers: {
        'User-Agent': 'Greenwater Foundation vessel database (contact@greenwater.org)',
        'Accept-Language': 'en',
      },
    })
    if (!res.ok) return null
    const data = await res.json()
    const a = data.address
    if (!a) return null
    return {
      city: a.city ?? a.town ?? a.village ?? a.suburb ?? a.municipality ?? a.district ?? a.county ?? null,
      state: a.state ?? a.region ?? a.province ?? null,
      country: a.country ?? null,
    }
  } catch {
    return null
  }
}

async function fetchEvents(gfwVesselId, apiKey, dataset, { perVessel, backfill }) {
  const pageSize = backfill ? 500 : perVessel
  const entries = []
  for (let offset = 0; ; offset += pageSize) {
    const url = new URL(`${GFW_API_BASE}/events`)
    url.searchParams.set('vessels[0]', gfwVesselId)
    url.searchParams.set('datasets[0]', dataset)
    url.searchParams.set('limit', String(pageSize))
    url.searchParams.set('offset', String(offset))
    url.searchParams.set('sort', '-start')
    const res = await fetch(url.toString(), {
      headers: { Authorization: `Bearer ${apiKey}` },
    })
    if (!res.ok) throw new Error(`GFW API ${res.status}`)
    const json = await res.json()
    entries.push(...(json.entries ?? []))
    if (!backfill || entries.length >= (json.total ?? 0) || (json.entries ?? []).length === 0) break
    await sleep(300)
  }
  return entries
}

// Map a GFW port visit event to a port_calls row. Location comes from the
// END anchorage — event.position is the START anchorage, which is why older
// rows had names that disagreed with their coordinates.
function toPortCall(vesselId, e) {
  const anch = e.port_visit?.endAnchorage
  const conf = parseInt(e.port_visit?.confidence, 10)
  return {
    vessel_id: vesselId,
    port_name: anch?.name ?? null,
    port_flag: anch?.flag ?? null,
    lat: anch?.lat ?? e.position?.lat ?? null,
    lon: anch?.lon ?? e.position?.lon ?? null,
    arrived_at: e.start,
    departed_at: e.end ?? null,
    duration_hrs: e.port_visit?.durationHrs ?? null,
    confidence: Number.isNaN(conf) ? null : conf,
    port_city: null,
    port_state: null,
    port_country: null,
  }
}

function toLoiteringEvent(vesselId, e) {
  return {
    vessel_id: vesselId,
    lat: e.position?.lat ?? null,
    lon: e.position?.lon ?? null,
    started_at: e.start,
    ended_at: e.end ?? null,
    duration_hrs: e.loitering?.totalTimeHours ?? null,
    avg_speed_knots: e.loitering?.averageSpeedKnots ?? null,
    avg_distance_from_shore_km: e.loitering?.averageDistanceFromShoreKm ?? null,
  }
}

/**
 * @param {object} supabase  service-role Supabase client
 * @param {string} apiKey    GFW API token
 * @param {object} [opts]
 * @param {number} [opts.limit]      only sync the first N vessels (testing / capped runs)
 * @param {number[]} [opts.ids]      only sync these vessel ids (targeted backfills)
 * @param {number} [opts.perVessel]  events fetched per vessel in weekly mode (default 5)
 * @param {boolean} [opts.backfill]  fetch full history and rewrite existing rows
 * @param {string[]} [opts.datasets] which event streams to sync: 'ports', 'loitering' (default both)
 * @param {function} [opts.log]
 */
export async function syncGfw(supabase, apiKey, opts = {}) {
  const { limit, ids, perVessel = 5, backfill = false, datasets = ['ports', 'loitering'], log = console.log } = opts
  const doPorts = datasets.includes('ports')
  const doLoitering = datasets.includes('loitering')
  if (!apiKey) throw new Error('GFW API key not provided')

  let query = supabase
    .from('vessels')
    .select('id, name, vessel_id_gfw')
    .not('vessel_id_gfw', 'is', null)
    .order('id')
  if (ids?.length) query = query.in('id', ids)
  if (limit) query = query.limit(limit)
  const { data: vessels, error } = await query
  if (error) throw error

  // Existing event keys so weekly mode only inserts new events.
  // PostgREST caps responses at 1000 rows, so page through.
  const loadKeys = async (table, tsCol) => {
    const keys = new Set()
    for (let page = 0; ; page++) {
      const { data, error: pageError } = await supabase
        .from(table)
        .select(`vessel_id, ${tsCol}`)
        .order('id')
        .range(page * 1000, page * 1000 + 999)
      if (pageError) throw pageError
      for (const r of data ?? []) keys.add(tsKey(r.vessel_id, r[tsCol]))
      if (!data || data.length < 1000) break
    }
    return keys
  }
  const existingKeys = backfill || !doPorts ? new Set() : await loadKeys('port_calls', 'arrived_at')
  const existingLoiterKeys = backfill || !doLoitering ? new Set() : await loadKeys('loitering_events', 'started_at')

  const result = {
    vessels: vessels?.length ?? 0,
    newPortCalls: 0,
    newLoiteringEvents: 0,
    geocoded: 0,
    nameMismatches: [],
    errors: 0,
  }

  for (const vessel of vessels ?? []) {
    if (doPorts) {
      let events
      try {
        events = await fetchEvents(vessel.vessel_id_gfw, apiKey, GFW_DATASET, { perVessel, backfill })
      } catch (e) {
        log(`  [${vessel.id}] ${vessel.name}: ${e.message}`)
        result.errors++
        await sleep(300)
        continue
      }

      // GFW echoes the vessel's self-reported name on every event — compare it
      // to ours to catch MMSI reassignments / wrong identity matches.
      const gfwName = events[0]?.vessel?.name
      if (gfwName && isRealMismatch(gfwName, vessel.name)) {
        result.nameMismatches.push({ vessel_id: vessel.id, db_name: vessel.name, gfw_name: gfwName })
      }

      const rows = events
        .filter((e) => e.start)
        .map((e) => toPortCall(vessel.id, e))
        .filter((r) => backfill || !existingKeys.has(tsKey(r.vessel_id, r.arrived_at)))

      if (rows.length > 0) {
        // Weekly: ignoreDuplicates guards against races on rows another run
        // inserted. Backfill: overwrite existing rows with corrected data.
        const { error: upsertError } = await supabase
          .from('port_calls')
          .upsert(rows, { onConflict: 'vessel_id,arrived_at', ignoreDuplicates: !backfill })
        if (upsertError) {
          log(`  [${vessel.id}] ${vessel.name}: upsert error: ${upsertError.message}`)
          result.errors++
        } else {
          log(`  [${vessel.id}] ${vessel.name}: ${rows.length} port call${rows.length === 1 ? '' : 's'} written`)
          result.newPortCalls += rows.length
        }
      }
      await sleep(300)
    }

    if (doLoitering) {
      // Loitering events (at-sea station keeping) — same pattern, no geocoding
      try {
        const loiterEvents = await fetchEvents(vessel.vessel_id_gfw, apiKey, GFW_LOITERING_DATASET, { perVessel, backfill })
        const loiterRows = loiterEvents
          .filter((e) => e.start)
          .map((e) => toLoiteringEvent(vessel.id, e))
          .filter((r) => backfill || !existingLoiterKeys.has(tsKey(r.vessel_id, r.started_at)))
        if (loiterRows.length > 0) {
          const { error: loiterError } = await supabase
            .from('loitering_events')
            .upsert(loiterRows, { onConflict: 'vessel_id,started_at', ignoreDuplicates: !backfill })
          if (loiterError) {
            log(`  [${vessel.id}] ${vessel.name}: loitering upsert error: ${loiterError.message}`)
            result.errors++
          } else {
            log(`  [${vessel.id}] ${vessel.name}: ${loiterRows.length} loitering event${loiterRows.length === 1 ? '' : 's'} written`)
            result.newLoiteringEvents += loiterRows.length
          }
        }
      } catch (e) {
        log(`  [${vessel.id}] ${vessel.name}: loitering: ${e.message}`)
        result.errors++
      }
      await sleep(300)
    }
  }

  // Geocode pass: fill location fields on each vessel's latest call only.
  const { data: latest, error: latestError } = doPorts
    ? await supabase
        .from('vessel_last_port')
        .select('vessel_id, arrived_at, lat, lon')
        .is('port_city', null)
        .not('lat', 'is', null)
        .not('lon', 'is', null)
    : { data: [], error: null }
  if (latestError) throw latestError

  const toGeocode = (limit || ids?.length)
    ? (latest ?? []).filter((r) => vessels.some((v) => v.id === r.vessel_id))
    : (latest ?? [])
  log(`Geocoding ${toGeocode.length} latest port calls…`)
  for (const row of toGeocode) {
    const geo = await reverseGeocode(row.lat, row.lon)
    await sleep(1100) // Nominatim 1 req/sec
    if (!geo?.city && !geo?.country) continue
    const { error: geoError } = await supabase
      .from('port_calls')
      .update({ port_city: geo.city, port_state: geo.state, port_country: geo.country })
      .eq('vessel_id', row.vessel_id)
      .eq('arrived_at', row.arrived_at)
    if (geoError) {
      log(`  geocode update failed for vessel ${row.vessel_id}: ${geoError.message}`)
      result.errors++
    } else {
      result.geocoded++
    }
  }

  if (result.nameMismatches.length > 0) {
    log(`\n⚠ ${result.nameMismatches.length} vessels where GFW reports a different name (possible wrong identity match):`)
    for (const m of result.nameMismatches) {
      log(`  [${m.vessel_id}] DB "${m.db_name}" vs GFW "${m.gfw_name}"`)
    }
  }

  return result
}
