import { NextResponse } from 'next/server'
import { createServerSupabaseClient } from '@/lib/supabase-server'
import { supabaseAdmin } from '@/lib/supabase-admin'

export async function PATCH(request: Request) {
  const supabase = createServerSupabaseClient()
  const { data: { user } } = await supabase.auth.getUser()

  if (!user) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }

  // Verify operator owns this vessel
  const { data: profile } = await supabaseAdmin
    .from('profiles')
    .select('role, vessel_id')
    .eq('id', user.id)
    .single()

  if (profile?.role !== 'operator' || !profile.vessel_id) {
    return NextResponse.json({ error: 'Forbidden' }, { status: 403 })
  }

  const body = await request.json()
  const { vessel_id, ...updates } = body

  if (vessel_id !== profile.vessel_id) {
    return NextResponse.json({ error: 'Forbidden' }, { status: 403 })
  }

  // Allowlist of editable fields
  const allowed = [
    'name', 'port_city', 'port_state', 'Operator_Name', 'Affiliation', 'url_ship',
    'Main_Activity', 'scientists', 'Speed_Cruise', 'length', 'Operating_area',
  ]

  const safeUpdates: Record<string, unknown> = {}
  for (const key of allowed) {
    if (key in updates) safeUpdates[key] = updates[key]
  }

  const { error } = await supabaseAdmin
    .from('vessels')
    .update(safeUpdates)
    .eq('id', profile.vessel_id)

  if (error) {
    console.error('vessel update error:', error)
    return NextResponse.json({ error: 'Update failed.' }, { status: 500 })
  }

  return NextResponse.json({ success: true })
}
