import { NextResponse } from 'next/server'
import { createServerSupabaseClient } from '@/lib/supabase-server'
import { supabaseAdmin } from '@/lib/supabase-admin'

const DENIED = new Set([
  'id', 'vessel_id_gfw', 'doc_details', 'last_updated',
  'last_port_city', 'last_port_state', 'last_port_country',
  'last_port_lat', 'last_port_lon', 'last_port_date',
])

export async function POST(request: Request) {
  const supabase = createServerSupabaseClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const { data: profile } = await supabaseAdmin
    .from('profiles')
    .select('role')
    .eq('id', user.id)
    .single()

  if (profile?.role !== 'admin') {
    return NextResponse.json({ error: 'Forbidden' }, { status: 403 })
  }

  const body = await request.json()

  const fields: Record<string, unknown> = {}
  for (const [key, value] of Object.entries(body)) {
    if (!DENIED.has(key)) fields[key] = value
  }

  if (!fields.name) {
    return NextResponse.json({ error: 'Vessel name is required.' }, { status: 400 })
  }

  // Auto-geocode if location provided
  const parts = [fields.port_city, fields.port_state, fields.country].filter(Boolean)
  if (parts.length > 0) {
    try {
      const q = encodeURIComponent((parts as string[]).join(', '))
      const res = await fetch(`https://nominatim.openstreetmap.org/search?q=${q}&format=json&limit=1`, {
        headers: { 'User-Agent': 'Greenwater Foundation vessel database (contact@greenwater.org)' },
      })
      const geo = await res.json()
      if (geo[0]) {
        fields.primary_latitude = geo[0].lat
        fields.primary_longitude = geo[0].lon
      }
    } catch {
      // Non-fatal
    }
  }

  const { data, error } = await supabaseAdmin
    .from('vessels')
    .insert(fields)
    .select('id')
    .single()

  if (error) {
    console.error('vessel create error:', error)
    return NextResponse.json({ error: `Create failed: ${error.message}` }, { status: 500 })
  }

  return NextResponse.json({ id: data.id }, { status: 201 })
}
