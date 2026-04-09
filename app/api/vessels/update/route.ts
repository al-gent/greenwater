import { NextResponse } from 'next/server'
import { createServerSupabaseClient } from '@/lib/supabase-server'
import { supabaseAdmin } from '@/lib/supabase-admin'

export async function PATCH(request: Request) {
  const supabase = createServerSupabaseClient()
  const { data: { user } } = await supabase.auth.getUser()

  if (!user) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }

  const { data: profile } = await supabaseAdmin
    .from('profiles')
    .select('role, vessel_id')
    .eq('id', user.id)
    .single()

  const body = await request.json()
  const { vessel_id, ...updates } = body

  // Admins can edit any vessel; operators can only edit their own
  if (profile?.role === 'admin') {
    if (!vessel_id) {
      return NextResponse.json({ error: 'vessel_id required' }, { status: 400 })
    }
  } else if (profile?.role === 'operator' && profile.vessel_id) {
    if (vessel_id !== profile.vessel_id) {
      return NextResponse.json({ error: 'Forbidden' }, { status: 403 })
    }
  } else {
    return NextResponse.json({ error: 'Forbidden' }, { status: 403 })
  }

  // Strip system-managed fields that should never be user-edited
  const denied = new Set([
    'id', 'vessel_id_gfw', 'doc_details', 'last_updated',
  ])

  const safeUpdates: Record<string, unknown> = {}
  for (const [key, value] of Object.entries(updates)) {
    if (!denied.has(key)) safeUpdates[key] = value
  }

  const { error } = await supabaseAdmin
    .from('vessels')
    .update(safeUpdates)
    .eq('id', vessel_id)

  if (error) {
    console.error('vessel update error:', error)
    return NextResponse.json({ error: `Update failed: ${error.message}` }, { status: 500 })
  }

  return NextResponse.json({ success: true })
}
