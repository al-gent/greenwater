import { NextResponse } from 'next/server'
import { createServerSupabaseClient } from '@/lib/supabase-server'
import { supabaseAdmin } from '@/lib/supabase-admin'
import { PROJECT_FIELDS, validateGear, validatePeople, uniqueProjectSlug } from '@/lib/projects'

// Create a project. Anyone signed in. Only a title is required; it starts as a private draft.
export async function POST(request: Request) {
  const { data: { user } } = await createServerSupabaseClient().auth.getUser()
  if (!user) return NextResponse.json({ error: 'Not signed in' }, { status: 401 })
  let body: Record<string, unknown>
  try { body = await request.json() } catch { return NextResponse.json({ error: 'Invalid JSON' }, { status: 400 }) }

  const row: Record<string, unknown> = { created_by: user.id, source: 'vesselconnect' }
  for (const [key, validate] of Object.entries(PROJECT_FIELDS)) {
    if (!(key in body)) continue
    const problem = validate(body[key])
    if (problem) return NextResponse.json({ error: problem }, { status: 400 })
    row[key] = body[key]
  }
  if (typeof row.title !== 'string') return NextResponse.json({ error: 'Title is required' }, { status: 400 })
  if ('gear' in body) { const p = validateGear(body.gear); if (p) return NextResponse.json({ error: p }, { status: 400 }) }
  if ('people' in body) { const p = validatePeople(body.people); if (p) return NextResponse.json({ error: p }, { status: 400 }) }
  if (body.publish === true) row.published_at = new Date().toISOString()
  row.slug = await uniqueProjectSlug(row.title as string)

  const { data, error } = await supabaseAdmin.from('projects').insert(row).select('id, slug').single()
  if (error) { console.error('project insert:', error); return NextResponse.json({ error: 'Could not save the project' }, { status: 500 }) }
  if (Array.isArray(body.gear) && body.gear.length) {
    const { error: gErr } = await supabaseAdmin.from('project_gear').insert((body.gear as any[]).map((g) => ({ project_id: data.id, label: g.label.trim(), equipment_type_id: g.equipment_type_id ?? null, quantity: g.quantity ?? null, notes: g.notes ?? null })))
    if (gErr) console.error('project_gear insert:', gErr)
  }
  if (Array.isArray(body.people) && body.people.length) {
    const { error: pErr } = await supabaseAdmin.from('project_people').insert((body.people as any[]).map((r) => ({ project_id: data.id, role_id: r.role_id, name: r.name.trim(), notes: r.notes ?? null })))
    if (pErr) console.error('project_people insert:', pErr)
  }
  return NextResponse.json({ id: data.id, slug: data.slug })
}
