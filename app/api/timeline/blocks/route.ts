import { NextResponse } from 'next/server'
import { createServerSupabaseClient } from '@/lib/supabase-server'
import { supabaseAdmin } from '@/lib/supabase-admin'
import { canOperateVessel } from '@/lib/operators'
import { blockResource, ConflictError } from '@/lib/timeline-service'

async function operatorOf(vesselId: number) {
  const { data: { user } } = await createServerSupabaseClient().auth.getUser()
  if (!user) return { error: NextResponse.json({ error: 'Not signed in' }, { status: 401 }) }
  const { data: profile } = await supabaseAdmin.from('profiles').select('is_admin').eq('id', user.id).single()
  if (!profile?.is_admin && !(await canOperateVessel(user.id, vesselId))) return { error: NextResponse.json({ error: 'You do not operate that vessel' }, { status: 403 }) }
  return { user }
}

// A vessel's own calendar items (blocks: unavailable, transit, yard…), upcoming first.
export async function GET(request: Request) {
  const vesselId = parseInt(new URL(request.url).searchParams.get('vessel') ?? '', 10)
  if (!Number.isFinite(vesselId)) return NextResponse.json({ error: 'vessel required' }, { status: 400 })
  const auth = await operatorOf(vesselId)
  if ('error' in auth) return auth.error
  const { data } = await supabaseAdmin.from('timeline_entries').select('id, label, notes, start_at, end_at, all_day, tz, created_at')
    .eq('vessel_id', vesselId).is('cruise_id', null).is('deleted_at', null).gte('end_at', new Date(Date.now() - 30 * 86_400_000).toISOString()).order('start_at')
  return NextResponse.json({ blocks: data ?? [] })
}

// Add one. Dates are calendar days (end inclusive, stored exclusive); the database refuses an
// overlap with a cruise or another block and the form names what is in the way.
export async function POST(request: Request) {
  let body: { vessel_id?: number; label?: string; notes?: string; start?: string; end?: string; tz?: string }
  try { body = await request.json() } catch { return NextResponse.json({ error: 'Invalid JSON' }, { status: 400 }) }
  if (!Number.isInteger(body.vessel_id)) return NextResponse.json({ error: 'vessel_id required' }, { status: 400 })
  const auth = await operatorOf(body.vessel_id!)
  if ('error' in auth) return auth.error
  const label = (body.label ?? '').trim()
  if (!label || label.length > 120) return NextResponse.json({ error: 'Say what the vessel is doing (up to 120 characters)' }, { status: 400 })
  if (!/^\d{4}-\d{2}-\d{2}$/.test(body.start ?? '') || !/^\d{4}-\d{2}-\d{2}$/.test(body.end ?? '')) return NextResponse.json({ error: 'Start and end must be dates' }, { status: 400 })
  if (body.end! < body.start!) return NextResponse.json({ error: 'The end is before the start' }, { status: 400 })
  const endExclusive = new Date(`${body.end}T00:00:00Z`); endExclusive.setUTCDate(endExclusive.getUTCDate() + 1)
  try {
    const entry = await blockResource({
      resource: { vesselId: body.vessel_id! }, start: `${body.start}T00:00:00Z`, end: endExclusive.toISOString(), allDay: true,
      tz: typeof body.tz === 'string' && body.tz.length <= 64 ? body.tz : 'UTC', label, notes: (body.notes ?? '').trim() || undefined, visibility: 'public', createdBy: auth.user.id,
    })
    return NextResponse.json({ block: entry })
  } catch (e) {
    if (e instanceof ConflictError) {
      const ids = e.conflicts.map((c) => c.cruise_id).filter(Boolean) as string[]
      const { data: cruises } = ids.length ? await supabaseAdmin.from('cruises').select('id, slug, title').in('id', ids) : { data: [] as any[] }
      const t = new Map((cruises ?? []).map((c: any) => [c.id, c]))
      return NextResponse.json({ error: 'Those dates overlap something already on the schedule', conflicts: e.conflicts.map((c) => ({ label: c.cruise_id ? t.get(c.cruise_id)?.title ?? 'A cruise' : c.label, slug: c.cruise_id ? t.get(c.cruise_id)?.slug ?? null : null, start_at: c.start_at, end_at: c.end_at })) }, { status: 409 })
    }
    console.error('block insert:', e); return NextResponse.json({ error: 'Could not save' }, { status: 500 })
  }
}
