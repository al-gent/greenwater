import { NextResponse } from 'next/server'
import { revalidatePath } from 'next/cache'
import { createServerSupabaseClient } from '@/lib/supabase-server'
import { supabaseAdmin, supabaseAdminAs } from '@/lib/supabase-admin'

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
  // `_geocode` is a client signal (not a column) — true only when the user edited
  // the home-port text by hand and wants the server to resolve coords.
  const { vessel_id, _geocode, ...updates } = body

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
    'id', 'vessel_id_gfw', 'doc_details', 'last_updated', 'created_at',
  ])

  const safeUpdates: Record<string, unknown> = {}
  for (const [key, value] of Object.entries(updates)) {
    if (!denied.has(key)) safeUpdates[key] = value
  }

  // Human edit → stamp listing freshness (machine syncs never set this)
  safeUpdates.last_updated = new Date().toISOString()

  // Only admins may change a vessel's status (active/inactive/retired)
  if (profile?.role !== 'admin') delete safeUpdates.status

  // Only geocode when the client explicitly asked (user edited the home-port text by
  // hand) AND no verified coords were provided. Crucially we do NOT geocode just because
  // port_city/etc. are present in the payload — the form resends every field on save, so
  // that would re-geocode and move the home port on unrelated edits (e.g. operating area).
  const coordsProvided = !!safeUpdates.primary_latitude && !!safeUpdates.primary_longitude
  if (_geocode === true && !coordsProvided) {
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

  const { error } = await supabaseAdminAs(user.email ?? user.id)
    .from('vessels')
    .update(safeUpdates)
    .eq('id', vessel_id)

  if (error) {
    console.error('vessel update error:', error)
    return NextResponse.json({ error: `Update failed: ${error.message}` }, { status: 500 })
  }

  // Bust the detail page's Router/Full-Route cache so edits show without a hard refresh
  revalidatePath(`/vessels/${vessel_id}`)

  return NextResponse.json({ success: true })
}
