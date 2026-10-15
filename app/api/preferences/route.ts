import { NextResponse } from 'next/server'
import { createServerSupabaseClient } from '@/lib/supabase-server'
import { supabaseAdmin } from '@/lib/supabase-admin'
import { isValidTimeZone } from '@/lib/preferences'
import { isScale } from '@/lib/timeline/scale'

// Keys any user may set in profiles.preferences, with their validators.
const VALIDATORS: Record<string, (v: unknown) => string | null> = {
  time_zone: (v) => (v === null || isValidTimeZone(v) ? null : 'time_zone must be an IANA zone like America/Los_Angeles'),
  timeline_scale: (v) => (v === null || isScale(v) ? null : 'timeline_scale must be day, week, month or year'),
}

export async function GET() {
  const { data: { user } } = await createServerSupabaseClient().auth.getUser()
  if (!user) return NextResponse.json({ error: 'Not signed in' }, { status: 401 })
  const { data, error } = await supabaseAdmin.from('profiles').select('preferences').eq('id', user.id).single()
  if (error) return NextResponse.json({ error: 'Failed to load preferences' }, { status: 500 })
  return NextResponse.json({ preferences: data?.preferences ?? {} })
}

export async function PATCH(request: Request) {
  const { data: { user } } = await createServerSupabaseClient().auth.getUser()
  if (!user) return NextResponse.json({ error: 'Not signed in' }, { status: 401 })
  let body: Record<string, unknown>
  try { body = await request.json() } catch { return NextResponse.json({ error: 'Invalid JSON' }, { status: 400 }) }

  const updates: Record<string, unknown> = {}
  for (const [key, validate] of Object.entries(VALIDATORS)) {
    if (!(key in body)) continue
    const problem = validate(body[key])
    if (problem) return NextResponse.json({ error: problem }, { status: 400 })
    updates[key] = body[key]
  }
  if (!Object.keys(updates).length) return NextResponse.json({ error: 'No valid preference keys provided' }, { status: 400 })

  // Merge so keys not in this request are preserved; null removes a key.
  const { data: current } = await supabaseAdmin.from('profiles').select('preferences').eq('id', user.id).single()
  const merged: Record<string, unknown> = { ...((current?.preferences as Record<string, unknown>) ?? {}) }
  for (const [k, v] of Object.entries(updates)) { if (v === null) delete merged[k]; else merged[k] = v }
  const { error } = await supabaseAdmin.from('profiles').update({ preferences: merged }).eq('id', user.id)
  if (error) return NextResponse.json({ error: 'Failed to save preferences' }, { status: 500 })
  return NextResponse.json({ preferences: merged })
}
