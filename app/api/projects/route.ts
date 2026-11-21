import { NextResponse } from 'next/server'
import { createServerSupabaseClient } from '@/lib/supabase-server'
import { supabaseAdmin } from '@/lib/supabase-admin'
import { PROJECT_FIELDS, validateGear, validatePeople, uniqueProjectSlug } from '@/lib/projects'

import { projectWriteError } from '@/lib/project-write-errors'

// Create a project. Anyone signed in. Only a title is required; it starts as a private draft.
export async function POST(request: Request) {
  const { data: { user } } = await createServerSupabaseClient().auth.getUser()
  if (!user) return NextResponse.json({ error: 'Not signed in' }, { status: 401 })
  let body: Record<string, unknown>
  try { body = await request.json() } catch { return NextResponse.json({ error: 'Invalid JSON' }, { status: 400 }) }

  if (!body || typeof body !== 'object' || Array.isArray(body)) return NextResponse.json({ error: 'Invalid project data' }, { status: 400 })
  const row: Record<string, unknown> = {}
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
  const slug = await uniqueProjectSlug(row.title)
  const { data, error } = await supabaseAdmin.rpc('create_planning_project', {
    p_actor: user.id, p_slug: slug, p_updates: row, p_gear: body.gear ?? null, p_people: body.people ?? null,
  })
  if (error) {
    const failure = projectWriteError(error)
    return NextResponse.json({ error: failure.error }, { status: failure.status })
  }
  return NextResponse.json(data)
}
