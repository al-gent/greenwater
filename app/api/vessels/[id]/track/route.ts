import { NextResponse } from 'next/server'
import { supabaseAdmin } from '@/lib/supabase-admin'
import { getTrackWindow } from '@/lib/track'

// Public track data for a vessel: port calls + at-sea (loitering) events
// within a time window. ?days=90|365|1825 or omitted for all time.
export async function GET(request: Request, { params }: { params: { id: string } }) {
  const id = parseInt(params.id, 10)
  if (isNaN(id)) return NextResponse.json({ error: 'bad id' }, { status: 400 })

  const daysParam = parseInt(new URL(request.url).searchParams.get('days') ?? '', 10)
  const days = isNaN(daysParam) ? null : daysParam

  try {
    const window = await getTrackWindow(supabaseAdmin, id, days)
    return NextResponse.json(window, {
      headers: { 'Cache-Control': 'public, max-age=300, stale-while-revalidate=3600' },
    })
  } catch (e) {
    console.error('track fetch error:', e)
    return NextResponse.json({ error: 'fetch failed' }, { status: 500 })
  }
}
