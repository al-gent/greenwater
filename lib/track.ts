/**
 * Track-window loading shared by the vessel detail page (initial render)
 * and /api/vessels/[id]/track (window changes from the client).
 */
import type { SupabaseClient } from '@supabase/supabase-js'

export interface TrackEvent {
  kind: 'port' | 'sea'
  lat: number
  lng: number
  name: string | null
  date: string // arrival/start, ISO
  hrs: number | null // time in port / on station
}

export interface TrackWindow {
  events: TrackEvent[] // oldest → newest
  totalInWindow: number // before thinning
  condensed: boolean // true when at-sea points were sampled down
}

// Safety ceiling only — the map renders on canvas, so thousands of points are
// fine. If a window somehow exceeds this we keep every port call and evenly
// sample the at-sea points across the window so the track's shape survives.
const MAX_POINTS = 5000

export async function getTrackWindow(
  supabase: SupabaseClient,
  vesselId: number,
  days: number | null
): Promise<TrackWindow> {
  const since = days ? new Date(Date.now() - days * 86400000).toISOString() : null

  // PostgREST caps responses at 1000 rows regardless of .limit(), so page.
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const fetchAll = async (table: string, cols: string, tsCol: string, cap: number): Promise<any[]> => {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const rows: any[] = []
    for (let page = 0; rows.length < cap; page++) {
      let q = supabase
        .from(table)
        .select(cols)
        .eq('vessel_id', vesselId)
        .not(tsCol, 'is', null)
        .not('lat', 'is', null)
        .order(tsCol, { ascending: false })
        .range(page * 1000, page * 1000 + 999)
      if (since) q = q.gte(tsCol, since)
      const { data, error } = await q
      if (error) throw error
      rows.push(...(data ?? []))
      if (!data || data.length < 1000) break
    }
    return rows.slice(0, cap)
  }

  const [portRows, seaRows] = await Promise.all([
    fetchAll('port_calls', 'port_name, lat, lon, arrived_at, duration_hrs', 'arrived_at', MAX_POINTS),
    fetchAll('loitering_events', 'lat, lon, started_at, duration_hrs', 'started_at', MAX_POINTS),
  ])

  const ports: TrackEvent[] = (portRows ?? []).map((r) => ({
    kind: 'port',
    lat: Number(r.lat),
    lng: Number(r.lon),
    name: r.port_name ?? null,
    date: r.arrived_at,
    hrs: r.duration_hrs != null ? Number(r.duration_hrs) : null,
  }))
  const sea: TrackEvent[] = (seaRows ?? []).map((r) => ({
    kind: 'sea',
    lat: Number(r.lat),
    lng: Number(r.lon),
    name: null,
    date: r.started_at,
    hrs: r.duration_hrs != null ? Number(r.duration_hrs) : null,
  }))

  const totalInWindow = ports.length + sea.length
  let keptPorts = ports
  let keptSea = sea
  let condensed = false

  if (totalInWindow > MAX_POINTS) {
    condensed = true
    keptPorts = ports.slice(0, MAX_POINTS) // newest first; ports win the budget
    const seaBudget = Math.max(MAX_POINTS - keptPorts.length, 0)
    if (sea.length > seaBudget && seaBudget > 0) {
      // even sample across the whole window, preserving track shape
      const step = sea.length / seaBudget
      keptSea = Array.from({ length: seaBudget }, (_, i) => sea[Math.floor(i * step)])
    } else if (seaBudget === 0) {
      keptSea = []
    }
  }

  const events = [...keptPorts, ...keptSea].sort((a, b) => (a.date < b.date ? -1 : 1))
  return { events, totalInWindow, condensed }
}
