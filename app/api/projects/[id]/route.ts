import { NextResponse } from 'next/server'
import { createServerSupabaseClient } from '@/lib/supabase-server'
import { supabaseAdmin } from '@/lib/supabase-admin'
import { PROJECT_FIELDS, validateGear, validatePeople, getProjectAsAdmin } from '@/lib/projects'
import { projectWriteError } from '@/lib/project-write-errors'

async function authorize(id: string) {
  const { data: { user } } = await createServerSupabaseClient().auth.getUser()
  if (!user) return { error: NextResponse.json({ error: 'Not signed in' }, { status: 401 }) }
  const project = await getProjectAsAdmin(id)
  if (!project) return { error: NextResponse.json({ error: 'Not found' }, { status: 404 }) }
  if (project.source === 'demo') return { error: NextResponse.json({ error: 'Example projects are read-only' }, { status: 409 }) }
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
  if (!body || typeof body !== 'object' || Array.isArray(body)) return NextResponse.json({ error: 'Invalid project data' }, { status: 400 })

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

  const { error } = await supabaseAdmin.rpc('save_project_changes', {
    p_project_id: auth.project.id, p_actor_id: auth.user.id, p_updates: updates,
    p_gear: body.gear ?? null, p_gear_ids: body.gear_ids ?? null, p_people: body.people ?? null,
  })
  if (error) {
    console.error('project save:', error)
    const failure = projectWriteError(error)
    return NextResponse.json({ error: failure.error }, { status: failure.status })
  }
  const project = await getProjectAsAdmin(params.id)
  return NextResponse.json({ project })
}
