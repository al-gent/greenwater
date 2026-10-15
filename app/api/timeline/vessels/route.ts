import { NextResponse } from 'next/server'
import { getVesselTimeline } from '@/lib/cruises'

// Public vessel occupancy for a date range; the timeline fetches more of this as you scroll.
export async function GET(request: Request) {
  const u = new URL(request.url)
  const from = new Date(u.searchParams.get('from') ?? ''), to = new Date(u.searchParams.get('to') ?? '')
  if (isNaN(from.getTime()) || isNaN(to.getTime()) || to <= from) return NextResponse.json({ error: 'from and to must be dates with to after from' }, { status: 400 })
  if (to.getTime() - from.getTime() > 400 * 86_400_000) return NextResponse.json({ error: 'range too large' }, { status: 400 })
  const vessel = u.searchParams.get('vessel')
  const vesselId = vessel ? parseInt(vessel, 10) : undefined
  // ?vessels=1,2,3 narrows to a set (the homepage search); long sets are filtered client-side instead.
  const list = (u.searchParams.get('vessels') ?? '').split(',').map((x) => parseInt(x, 10)).filter(Number.isFinite).slice(0, 100)
  const entries = await getVesselTimeline({ from, to, vesselId: Number.isFinite(vesselId) ? vesselId : undefined, vesselIds: list.length ? list : undefined })
  return NextResponse.json({ entries }, { headers: { 'Cache-Control': 'public, max-age=60, stale-while-revalidate=300' } })
}
