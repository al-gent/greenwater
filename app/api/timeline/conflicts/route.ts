import { NextResponse } from 'next/server'
import { createServerSupabaseClient } from '@/lib/supabase-server'
import { findConflicts } from '@/lib/timeline-service'
import { supabaseAdmin } from '@/lib/supabase-admin'

// Live "is this vessel free" check for forms. Signed-in only; returns the overlapping
// entries with their cruise titles so the form can say what is in the way.
export async function GET(request: Request) {
  const { data: { user } } = await createServerSupabaseClient().auth.getUser()
  if (!user) return NextResponse.json({ error: 'Not signed in' }, { status: 401 })
  const u = new URL(request.url)
  const vessel = parseInt(u.searchParams.get('vessel') ?? '', 10)
  const start = new Date(u.searchParams.get('start') ?? ''), end = new Date(u.searchParams.get('end') ?? '')
  if (!Number.isFinite(vessel) || isNaN(start.getTime()) || isNaN(end.getTime()) || end <= start) return NextResponse.json({ error: 'vessel, start and end required' }, { status: 400 })
  const entries = await findConflicts({ vesselIds: [vessel], start: start.toISOString(), end: end.toISOString(), ignoreCruiseId: u.searchParams.get('ignoreCruise') })
  const cruiseIds = entries.map((e) => e.cruise_id).filter(Boolean) as string[]
  const { data: cruises } = cruiseIds.length ? await supabaseAdmin.from('cruises').select('id, slug, title').in('id', cruiseIds) : { data: [] as any[] }
  const titles = new Map((cruises ?? []).map((c: any) => [c.id, c]))
  return NextResponse.json({
    conflicts: entries.map((e) => ({ id: e.id, start_at: e.start_at, end_at: e.end_at, label: e.cruise_id ? titles.get(e.cruise_id)?.title ?? 'A cruise' : e.label, slug: e.cruise_id ? titles.get(e.cruise_id)?.slug ?? null : null, kind: e.cruise_id ? 'cruise' : 'block' })),
  })
}
