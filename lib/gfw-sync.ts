/**
 * GFW port visit sync — used by the Vercel Cron API route.
 * Server-only (uses supabaseAdmin + fetch against GFW API).
 */
import { supabaseAdmin } from './supabase-admin'

const GFW_API_BASE = 'https://gateway.api.globalfishingwatch.org/v3'
const GFW_DATASET = 'public-global-port-visits-c2-events:latest'

export interface SyncResult {
  vessels: number
  portCallsAttempted: number
  errors: number
}

function sleep(ms: number) {
  return new Promise((resolve) => setTimeout(resolve, ms))
}

async function reverseGeocode(lat: number, lon: number): Promise<{ city: string | null; state: string | null; country: string | null } | null> {
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

export async function syncGfw(limit?: number): Promise<SyncResult> {
  const apiKey = process.env.GLOBAL_FISHING_WATCH_API_KEY
  if (!apiKey) throw new Error('GLOBAL_FISHING_WATCH_API_KEY not set')

  let query = supabaseAdmin
    .from('vessels')
    .select('id, vessel_id_gfw')
    .not('vessel_id_gfw', 'is', null)
    .order('id')

  if (limit) query = query.limit(limit)

  const { data: vessels, error } = await query
  if (error) throw error

  let portCallsAttempted = 0
  let errors = 0

  for (const vessel of vessels ?? []) {
    try {
      const url = new URL(`${GFW_API_BASE}/events`)
      url.searchParams.set('vessels[0]', vessel.vessel_id_gfw!)
      url.searchParams.set('datasets[0]', GFW_DATASET)
      url.searchParams.set('limit', '5')
      url.searchParams.set('offset', '0')
      url.searchParams.set('sort', '-start')

      const res = await fetch(url.toString(), {
        headers: { Authorization: `Bearer ${apiKey}` },
      })

      if (!res.ok) {
        console.error(`GFW API ${res.status} for vessel ${vessel.id}`)
        errors++
        await sleep(300)
        continue
      }

      const json = await res.json()
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const rawEvents = (json.entries ?? []).map((e: any) => ({
        vessel_id: vessel.id,
        port_name: e.port_visit?.endAnchorage?.name ?? null,
        port_flag: e.port_visit?.endAnchorage?.flag ?? null,
        lat: e.position?.lat ?? null,
        lon: e.position?.lon ?? null,
        arrived_at: e.start,
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      })).filter((p: any) => p.arrived_at)

      // Reverse geocode each event to get structured location fields
      const events = []
      for (const raw of rawEvents) {
        let geo = null
        if (raw.lat != null && raw.lon != null) {
          geo = await reverseGeocode(raw.lat, raw.lon)
          await sleep(1100)
        }
        events.push({ ...raw, port_city: geo?.city ?? null, port_state: geo?.state ?? null, port_country: geo?.country ?? null })
      }

      if (events.length > 0) {
        const { error: upsertError } = await supabaseAdmin
          .from('port_calls')
          .upsert(events, { onConflict: 'vessel_id,arrived_at', ignoreDuplicates: true })

        if (upsertError) {
          console.error(`Upsert error for vessel ${vessel.id}:`, upsertError.message)
          errors++
        } else {
          portCallsAttempted += events.length
        }
      }
    } catch (e) {
      console.error(`Error syncing vessel ${vessel.id}:`, e)
      errors++
    }

    await sleep(300)
  }

  return { vessels: vessels?.length ?? 0, portCallsAttempted, errors }
}
