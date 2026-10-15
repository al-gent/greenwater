import { NextResponse } from 'next/server'
import { createServerSupabaseClient } from '@/lib/supabase-server'
import { supabaseAdmin } from '@/lib/supabase-admin'
import { getProjectAsAdmin } from '@/lib/projects'
import { bidState } from '@/lib/project-utils'
import { canOperateVessel } from '@/lib/operators'
import { findConflicts, syncCruiseEntries, ConflictError } from '@/lib/timeline-service'
import { notifyBidAccepted, notifyBidConfirmed, notifyBidDeclined, notifyBidWithdrawn } from '@/lib/project-notify'
import { readBidBody } from '@/lib/project-utils'

// Both sides of the handshake on one bid.
//   researcher (project author / admin): accept (declines the others) | decline
//   operator (of the bid's vessel):      update (fields + gear, only while offered) | withdraw
// The operator's confirm (which creates the cruise) lives in a later step.
export async function PATCH(request: Request, { params }: { params: { id: string; bidId: string } }) {
  const { data: { user } } = await createServerSupabaseClient().auth.getUser()
  if (!user) return NextResponse.json({ error: 'Not signed in' }, { status: 401 })
  const project = await getProjectAsAdmin(params.id)
  if (!project) return NextResponse.json({ error: 'Not found' }, { status: 404 })
  const { data: profile } = await supabaseAdmin.from('profiles').select('is_admin').eq('id', user.id).single()
  let body: Record<string, unknown> & { action?: string }
  try { body = await request.json() } catch { return NextResponse.json({ error: 'Invalid JSON' }, { status: 400 }) }

  const { data: bid } = await supabaseAdmin.from('project_bids').select('id, project_id, vessel_id, accepted_at, confirmed_at, declined_at, withdrawn_at').eq('id', params.bidId).eq('project_id', params.id).maybeSingle()
  if (!bid) return NextResponse.json({ error: 'Bid not found' }, { status: 404 })
  const now = new Date().toISOString()

  // ── operator confirms an accepted bid: the cruise is born here ──
  if (body.action === 'confirm') {
    if (!profile?.is_admin && !(await canOperateVessel(user.id, bid.vessel_id))) return NextResponse.json({ error: 'Forbidden' }, { status: 403 })
    if (bidState(bid) !== 'accepted') return NextResponse.json({ error: `This bid is ${bidState(bid)}; only an accepted bid can be confirmed` }, { status: 409 })
    if (project.cruise_id) return NextResponse.json({ error: 'This project is already scheduled' }, { status: 409 })
    const { data: full } = await supabaseAdmin.from('project_bids').select('*').eq('id', bid.id).single()
    const { data: vessel } = await supabaseAdmin.from('vessels').select('id, organization_id').eq('id', bid.vessel_id).single()
    // The dates must be clear now, not just when the bid was placed.
    const clash = await findConflicts({ vesselIds: [bid.vessel_id], start: full.proposed_departure_at, end: full.proposed_arrival_at })
    if (clash.length) return NextResponse.json({ error: 'The vessel is no longer free on those dates', conflicts: clash.map((c) => ({ start_at: c.start_at, end_at: c.end_at, label: c.label })) }, { status: 409 })

    const { data: cruise, error: cErr } = await supabaseAdmin.from('cruises').insert({
      vessel_id: bid.vessel_id, organization_id: vessel?.organization_id ?? null, created_by: user.id,
      title: project.title,
      operating_area_geojson: project.area_geojson, operating_area: project.area_label,
      departure_at: full.proposed_departure_at, arrival_at: full.proposed_arrival_at,
      science_party_size: project.party_size, berths_total: full.berths,
      source: 'vesselconnect', published_at: now, confirmed_at: now, confirmed_by: user.id,
    }).select('id, slug').single()
    if (cErr || !cruise) { console.error('confirm: cruise insert', cErr); return NextResponse.json({ error: 'Could not create the cruise' }, { status: 500 }) }

    // The vessel's timeline entry; a race with another booking lands here as a ConflictError.
    try { await syncCruiseEntries(cruise.id) } catch (e) {
      await supabaseAdmin.from('cruises').update({ cancelled_at: now, published_at: null }).eq('id', cruise.id)
      if (e instanceof ConflictError) return NextResponse.json({ error: 'The vessel is no longer free on those dates' }, { status: 409 })
      throw e
    }

    // The project and bid point at the cruise; people and gear stay on the project and are
    // read through the link (and the science party's timeline entries come from there).
    await supabaseAdmin.from('projects').update({ cruise_id: cruise.id }).eq('id', project.id)
    await supabaseAdmin.from('project_bids').update({ confirmed_at: now, confirmed_by: user.id, cruise_id: cruise.id }).eq('id', bid.id)
    await syncCruiseEntries(cruise.id)
    void notifyBidConfirmed(bid.id, cruise.slug)
    return NextResponse.json({ ok: true, cruise_id: cruise.id, cruise_slug: cruise.slug })
  }

  // ── operator actions ──
  if (body.action === 'update' || body.action === 'withdraw') {
    if (!profile?.is_admin && !(await canOperateVessel(user.id, bid.vessel_id))) return NextResponse.json({ error: 'Forbidden' }, { status: 403 })
    if (body.action === 'withdraw') {
      if (!['offered', 'accepted'].includes(bidState(bid))) return NextResponse.json({ error: `This bid is ${bidState(bid)}` }, { status: 409 })
      const { error } = await supabaseAdmin.from('project_bids').update({ withdrawn_at: now, withdrawn_by: user.id }).eq('id', bid.id)
      if (error) return NextResponse.json({ error: 'Could not withdraw' }, { status: 500 })
      void notifyBidWithdrawn(bid.id)
      return NextResponse.json({ ok: true })
    }
    if (bidState(bid) !== 'offered') return NextResponse.json({ error: 'An accepted bid is frozen; make a new bid to change it' }, { status: 409 })
    const parsed = readBidBody(body)
    if ('error' in parsed) return NextResponse.json({ error: parsed.error }, { status: 400 })
    const { vessel_id: _v, ...row } = parsed.row   // the vessel is fixed once offered
    if (Object.keys(row).length) {
      const { error } = await supabaseAdmin.from('project_bids').update(row).eq('id', bid.id)
      if (error) return NextResponse.json({ error: 'Could not save the bid' }, { status: 500 })
    }
    if (Array.isArray(body.gear)) {
      await supabaseAdmin.from('bid_gear').delete().eq('bid_id', bid.id)
      if (body.gear.length) await supabaseAdmin.from('bid_gear').insert((body.gear as any[]).map((g) => ({ project_id: params.id, bid_id: bid.id, project_gear_id: g.project_gear_id, answer: g.answer, notes: g.notes ?? null })))
    }
    return NextResponse.json({ ok: true })
  }

  // ── researcher actions ──
  if (project.created_by !== user.id && !profile?.is_admin) return NextResponse.json({ error: 'Forbidden' }, { status: 403 })

  if (body.action === 'accept') {
    if (bidState(bid) !== 'offered') return NextResponse.json({ error: `This bid is ${bidState(bid)}, not open` }, { status: 409 })
    if (project.cruise_id) return NextResponse.json({ error: 'This project is already scheduled' }, { status: 409 })
    const { error } = await supabaseAdmin.from('project_bids').update({ accepted_at: now, accepted_by: user.id }).eq('id', bid.id)
    if (error) return NextResponse.json({ error: 'Could not accept' }, { status: 500 })
    // Other open bids on this project stand down.
    const { data: others } = await supabaseAdmin.from('project_bids').update({ declined_at: now, declined_by: user.id })
      .eq('project_id', params.id).neq('id', bid.id).is('accepted_at', null).is('declined_at', null).is('withdrawn_at', null).is('confirmed_at', null).select('id')
    void notifyBidAccepted(bid.id)
    for (const o of others ?? []) void notifyBidDeclined(o.id)
    return NextResponse.json({ ok: true })
  }
  if (body.action === 'decline') {
    if (!['offered', 'accepted'].includes(bidState(bid))) return NextResponse.json({ error: `This bid is ${bidState(bid)}` }, { status: 409 })
    const { error } = await supabaseAdmin.from('project_bids').update({ declined_at: now, declined_by: user.id }).eq('id', bid.id)
    if (error) return NextResponse.json({ error: 'Could not decline' }, { status: 500 })
    void notifyBidDeclined(bid.id)
    return NextResponse.json({ ok: true })
  }
  return NextResponse.json({ error: 'action must be accept or decline' }, { status: 400 })
}
