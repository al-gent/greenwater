import { NextResponse } from 'next/server'
import { getPastCruises } from '@/lib/cruises'
import { projectCardsForCruises } from '@/lib/project-cards'

const PAST_PAGE = 12

// Older projects on a vessel, a page of cruises at a time, most recent first. Public.
export async function GET(request: Request, { params }: { params: { id: string } }) {
  const vesselId = parseInt(params.id, 10)
  const page = Math.max(1, parseInt(new URL(request.url).searchParams.get('page') ?? '1', 10) || 1)
  if (!Number.isFinite(vesselId)) return NextResponse.json({ error: 'bad vessel' }, { status: 400 })
  const { cruises, total } = await getPastCruises({ vesselId, page, limit: PAST_PAGE })
  const cards = await projectCardsForCruises([...cruises].reverse())   // oldest → newest within the page
  return NextResponse.json({ cards, total, page, pageSize: PAST_PAGE }, { headers: { 'Cache-Control': 'public, max-age=300, stale-while-revalidate=600' } })
}
