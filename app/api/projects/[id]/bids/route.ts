import { NextResponse } from 'next/server'
import { createServerSupabaseClient } from '@/lib/supabase-server'
import { supabaseAdmin } from '@/lib/supabase-admin'
import { canOperateVessel } from '@/lib/operators'
import { getProjectAsAdmin } from '@/lib/projects'
import { readBidBody } from '@/lib/project-utils'
import { notifyBidOffered } from '@/lib/project-notify'

// Operator offers to run a project on a vessel they operate.
export async function POST(request: Request, { params }: { params: { id: string } }) {
  const { data: { user } } = await createServerSupabaseClient().auth.getUser()
  if (!user) return NextResponse.json({ error: 'Not signed in' }, { status: 401 })
  const project = await getProjectAsAdmin(params.id)
  if (!project || !project.published_at) return NextResponse.json({ error: 'Project not open for bids' }, { status: 404 })
  if (project.cruise_id) return NextResponse.json({ error: 'This project is already scheduled' }, { status: 409 })
  let body: Record<string, unknown>
  try { body = await request.json() } catch { return NextResponse.json({ error: 'Invalid JSON' }, { status: 400 }) }
  const parsed = readBidBody(body)
  if ('error' in parsed) return NextResponse.json({ error: parsed.error }, { status: 400 })
  const row = parsed.row
  for (const k of ['vessel_id', 'proposed_departure_at', 'proposed_arrival_at']) if (!(k in row)) return NextResponse.json({ error: `${k.replace(/_/g, ' ')} is required` }, { status: 400 })
  if (!(await canOperateVessel(user.id, row.vessel_id as number))) return NextResponse.json({ error: 'You do not operate that vessel' }, { status: 403 })

  // One open bid per vessel per project; a second offer updates it.
  const { data: open } = await supabaseAdmin.from('project_bids').select('id').eq('project_id', params.id).eq('vessel_id', row.vessel_id as number)
    .is('accepted_at', null).is('declined_at', null).is('withdrawn_at', null).is('confirmed_at', null).maybeSingle()
  if (open) return NextResponse.json({ error: 'You already have an open bid from that vessel; update it instead', bid_id: open.id }, { status: 409 })

  const { data, error } = await supabaseAdmin.from('project_bids').insert({ ...row, project_id: params.id, offered_by: user.id }).select('id').single()
  if (error) { console.error('bid insert:', error); return NextResponse.json({ error: 'Could not save the bid' }, { status: 500 }) }
  if (Array.isArray(body.gear) && body.gear.length) {
    const { error: gErr } = await supabaseAdmin.from('bid_gear').insert((body.gear as any[]).map((g) => ({ project_id: params.id, bid_id: data.id, project_gear_id: g.project_gear_id, answer: g.answer, notes: g.notes ?? null })))
    if (gErr) console.error('bid_gear insert:', gErr)
  }
  void notifyBidOffered(data.id)
  return NextResponse.json({ id: data.id })
}
