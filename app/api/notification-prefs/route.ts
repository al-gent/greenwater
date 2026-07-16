import { NextResponse } from 'next/server'
import { createServerSupabaseClient } from '@/lib/supabase-server'
import { supabaseAdmin } from '@/lib/supabase-admin'

// Keys any user may set in profiles.notification_prefs. Opt-out model:
// missing key = subscribed, false = muted.
const ALLOWED_KEYS = ['new_claim', 'new_submission', 'new_signup'] as const

export async function GET() {
  const supabase = createServerSupabaseClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return NextResponse.json({ error: 'Not signed in' }, { status: 401 })

  const { data, error } = await supabaseAdmin
    .from('profiles')
    .select('notification_prefs')
    .eq('id', user.id)
    .single()

  if (error) {
    console.error('notification-prefs select error:', error)
    return NextResponse.json({ error: 'Failed to load preferences' }, { status: 500 })
  }
  return NextResponse.json({ prefs: data?.notification_prefs ?? {} })
}

export async function PATCH(request: Request) {
  const supabase = createServerSupabaseClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return NextResponse.json({ error: 'Not signed in' }, { status: 401 })

  let body: Record<string, unknown>
  try {
    body = await request.json()
  } catch {
    return NextResponse.json({ error: 'Invalid JSON' }, { status: 400 })
  }

  const updates: Record<string, boolean> = {}
  for (const key of ALLOWED_KEYS) {
    if (key in body) {
      if (typeof body[key] !== 'boolean') {
        return NextResponse.json({ error: `${key} must be a boolean` }, { status: 400 })
      }
      updates[key] = body[key] as boolean
    }
  }
  if (Object.keys(updates).length === 0) {
    return NextResponse.json({ error: 'No valid preference keys provided' }, { status: 400 })
  }

  // Merge into existing prefs so keys not in this request are preserved.
  const { data: current, error: selectError } = await supabaseAdmin
    .from('profiles')
    .select('notification_prefs')
    .eq('id', user.id)
    .single()

  if (selectError) {
    console.error('notification-prefs select error:', selectError)
    return NextResponse.json({ error: 'Failed to load preferences' }, { status: 500 })
  }

  const merged = { ...(current?.notification_prefs ?? {}), ...updates }
  const { error } = await supabaseAdmin
    .from('profiles')
    .update({ notification_prefs: merged })
    .eq('id', user.id)

  if (error) {
    console.error('notification-prefs update error:', error)
    return NextResponse.json({ error: 'Failed to save preferences' }, { status: 500 })
  }
  return NextResponse.json({ prefs: merged })
}
