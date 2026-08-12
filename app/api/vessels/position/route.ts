import { NextResponse } from 'next/server'
import { getServerUser } from '@/lib/supabase-server'
import { supabaseAdmin } from '@/lib/supabase-admin'
import { canOperateVessel } from '@/lib/operators'

// Operator reports their vessel's current location: a label plus coordinates
// they verified in the UI (autocomplete pick or dropped pin). Appends to
// vessel_position_reports. Never touches GFW's vessel_last_port.
export async function POST(request: Request) {
  const user = await getServerUser()
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const body = await request.json().catch(() => null)
  const vesselId = parseInt(body?.vessel_id, 10)
  const portText = typeof body?.port_text === 'string' ? body.port_text.trim() : ''
  if (isNaN(vesselId) || !portText) {
    return NextResponse.json({ error: 'vessel_id and port_text are required' }, { status: 400 })
  }
  if (portText.length > 120) {
    return NextResponse.json({ error: 'Location text is too long.' }, { status: 400 })
  }

  if (!(await canOperateVessel(user.id, vesselId))) {
    return NextResponse.json({ error: 'Forbidden' }, { status: 403 })
  }

  // Coordinates come from the client's explicit choice — a selected
  // autocomplete match or a dropped pin — never a blind server-side guess.
  const lat = typeof body.lat === 'number' ? body.lat : NaN
  const lon = typeof body.lon === 'number' ? body.lon : NaN
  if (!isFinite(lat) || !isFinite(lon) || Math.abs(lat) > 90 || Math.abs(lon) > 180) {
    return NextResponse.json({ error: 'Valid lat and lon are required.' }, { status: 400 })
  }

  const { data: report, error } = await supabaseAdmin
    .from('vessel_position_reports')
    .insert({ vessel_id: vesselId, user_id: user.id, port_text: portText, lat, lon })
    .select('port_text, lat, lon, reported_at')
    .single()

  if (error) {
    console.error('position report insert error:', error)
    return NextResponse.json({ error: 'Failed to save location.' }, { status: 500 })
  }

  return NextResponse.json({ report })
}
