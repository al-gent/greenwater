import { NextResponse } from 'next/server'
import { createServerSupabaseClient } from '@/lib/supabase-server'
import { findConflicts } from '@/lib/timeline-service'
import { visibleConflicts } from '@/lib/visible-conflicts'

// Live "is this vessel free" check for forms. Signed-in only; returns the overlapping
// entries with their cruise titles so the form can say what is in the way.
export async function GET(request: Request) {
  const viewer = createServerSupabaseClient()
  const { data: { user } } = await viewer.auth.getUser()
  if (!user) return NextResponse.json({ error: 'Not signed in' }, { status: 401 })
  const u = new URL(request.url)
  const vessel = parseInt(u.searchParams.get('vessel') ?? '', 10)
  const start = new Date(u.searchParams.get('start') ?? ''), end = new Date(u.searchParams.get('end') ?? '')
  if (!Number.isFinite(vessel) || isNaN(start.getTime()) || isNaN(end.getTime()) || end <= start) return NextResponse.json({ error: 'vessel, start and end required' }, { status: 400 })
  const entries = await findConflicts({ vesselIds: [vessel], start: start.toISOString(), end: end.toISOString() })
  const conflicts = await visibleConflicts(viewer, entries, u.searchParams.get('ignoreCruise'))
  return NextResponse.json({ conflicts })
}
