import { NextResponse } from 'next/server'
import { createServerSupabaseClient } from '@/lib/supabase-server'
import { supabaseAdmin } from '@/lib/supabase-admin'
import { getProjectAsAdmin } from '@/lib/projects'
import { readBidBody } from '@/lib/project-utils'
import { projectWriteError } from '@/lib/project-write-errors'
import { notifyBidAccepted, notifyBidConfirmed, notifyBidDeclined, notifyBidWithdrawn } from '@/lib/project-notify'

export async function PATCH(request: Request, { params }: { params: { id: string; bidId: string } }) {
  const { data: { user } } = await createServerSupabaseClient().auth.getUser()
  if (!user) return NextResponse.json({ error: 'Not signed in' }, { status: 401 })
  const project = await getProjectAsAdmin(params.id)
  if (!project) return NextResponse.json({ error: 'Not found' }, { status: 404 })
  if (project.source === 'demo') return NextResponse.json({ error: 'Example projects do not accept bids' }, { status: 409 })
  let body: Record<string, unknown>
  try { body = await request.json() } catch { return NextResponse.json({ error: 'Invalid JSON' }, { status: 400 }) }
  if (!body || typeof body !== 'object' || !['accept', 'confirm', 'decline', 'withdraw', 'update'].includes(body.action as string)) {
    return NextResponse.json({ error: 'Unknown bid action' }, { status: 400 })
  }
  let updates: Record<string, unknown> = {}
  if (body.action === 'update') {
    const parsed = readBidBody(body)
    if ('error' in parsed) return NextResponse.json({ error: parsed.error }, { status: 400 })
    updates = parsed.row
  }
  const { data, error } = await supabaseAdmin.rpc('transition_project_bid', {
    p_project_id: project.id, p_bid_id: params.bidId, p_actor_id: user.id, p_action: body.action,
    p_updates: updates, p_gear: body.action === 'update' ? body.gear ?? null : null,
  })
  if (error || !data) {
    console.error('bid transition:', error)
    const failure = projectWriteError(error ?? {})
    return NextResponse.json({ error: failure.error }, { status: failure.status })
  }
  if (data.changed) {
    if (body.action === 'accept') {
      void notifyBidAccepted(params.bidId)
      for (const declinedId of data.declined_ids ?? []) void notifyBidDeclined(declinedId)
    }
    if (body.action === 'confirm') void notifyBidConfirmed(params.bidId, data.cruise_slug)
    if (body.action === 'decline') void notifyBidDeclined(params.bidId)
    if (body.action === 'withdraw') void notifyBidWithdrawn(params.bidId)
  }
  return NextResponse.json({ ok: true, ...(body.action === 'confirm' ? { cruise_id: data.cruise_id, cruise_slug: data.cruise_slug } : {}) })
}
