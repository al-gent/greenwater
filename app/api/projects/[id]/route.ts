import { NextResponse } from 'next/server'
import { createServerSupabaseClient } from '@/lib/supabase-server'
import { supabaseAdmin } from '@/lib/supabase-admin'
import { PROJECT_FIELDS, validateGear, validatePeople, getProjectAsAdmin } from '@/lib/projects'
import { syncProjectPeopleEntries } from '@/lib/timeline-service'

async function authorize(id: string) {
  const { data: { user } } = await createServerSupabaseClient().auth.getUser()
  if (!user) return { error: NextResponse.json({ error: 'Not signed in' }, { status: 401 }) }
  const project = await getProjectAsAdmin(id)
  if (!project) return { error: NextResponse.json({ error: 'Not found' }, { status: 404 }) }
  const { data: profile } = await supabaseAdmin.from('profiles').select('is_admin').eq('id', user.id).single()
  if (project.created_by !== user.id && !profile?.is_admin) return { error: NextResponse.json({ error: 'Forbidden' }, { status: 403 }) }
  return { user, project }
}

// Update a project (author or admin). `gear` replaces the whole list. `publish: true` publishes;
// `publish: false` returns it to draft (only while no cruise is attached).
export async function PATCH(request: Request, { params }: { params: { id: string } }) {
  const auth = await authorize(params.id)
  if ('error' in auth) return auth.error
  let body: Record<string, unknown>
  try { body = await request.json() } catch { return NextResponse.json({ error: 'Invalid JSON' }, { status: 400 }) }

  const updates: Record<string, unknown> = {}
  for (const [key, validate] of Object.entries(PROJECT_FIELDS)) {
    if (!(key in body)) continue
    const problem = validate(body[key])
    if (problem) return NextResponse.json({ error: problem }, { status: 400 })
    updates[key] = body[key]
  }
  if ('gear' in body) { const p = validateGear(body.gear); if (p) return NextResponse.json({ error: p }, { status: 400 }) }
  if ('people' in body) { const p = validatePeople(body.people); if (p) return NextResponse.json({ error: p }, { status: 400 }) }
  if (body.publish === true && !auth.project.published_at) updates.published_at = new Date().toISOString()
  if (body.publish === false) {
    if (auth.project.cruise_id) return NextResponse.json({ error: 'This project is scheduled on a cruise and cannot go back to draft' }, { status: 409 })
    updates.published_at = null
  }

  if (Object.keys(updates).length) {
    const { error } = await supabaseAdmin.from('projects').update(updates).eq('id', params.id)
    if (error) { console.error('project update:', error); return NextResponse.json({ error: 'Could not save the project' }, { status: 500 }) }
  }
  if (Array.isArray(body.gear)) {
    await supabaseAdmin.from('project_gear').delete().eq('project_id', params.id)
    if (body.gear.length) {
      const { error: gErr } = await supabaseAdmin.from('project_gear').insert((body.gear as any[]).map((g) => ({ project_id: params.id, label: g.label.trim(), equipment_type_id: g.equipment_type_id ?? null, quantity: g.quantity ?? null, notes: g.notes ?? null })))
      if (gErr) { console.error('project_gear replace:', gErr); return NextResponse.json({ error: 'Saved, but the gear list failed' }, { status: 500 }) }
    }
  }
  if (Array.isArray(body.people)) {
    await supabaseAdmin.from('project_people').delete().eq('project_id', params.id)
    if (body.people.length) {
      const { error: pErr } = await supabaseAdmin.from('project_people').insert((body.people as any[]).map((r) => ({ project_id: params.id, role_id: r.role_id, name: r.name.trim(), notes: r.notes ?? null })))
      if (pErr) { console.error('project_people replace:', pErr); return NextResponse.json({ error: 'Saved, but the people list failed' }, { status: 500 }) }
    }
    if (auth.project.cruise_id) await syncProjectPeopleEntries(auth.project.cruise_id)
  }
  const project = await getProjectAsAdmin(params.id)
  return NextResponse.json({ project })
}
