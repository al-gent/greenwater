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

  // Auto-geocode if location fields changed
  const locationChanged = ['port_city', 'port_state', 'country'].some((f) => f in safeUpdates)
  if (locationChanged) {
    const parts = [safeUpdates.port_city, safeUpdates.port_state, safeUpdates.country].filter(Boolean)
    if (parts.length > 0) {
      try {
        const q = encodeURIComponent((parts as string[]).join(', '))
        const res = await fetch(`https://nominatim.openstreetmap.org/search?q=${q}&format=json&limit=1`, {
          headers: { 'User-Agent': 'Greenwater Foundation vessel database (contact@greenwater.org)' },
        })
        const geo = await res.json()
        if (geo[0]) {
          safeUpdates.primary_latitude = geo[0].lat
          safeUpdates.primary_longitude = geo[0].lon
        }
      } catch {
        // Non-fatal — proceed without geocoding
      }
    }
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
