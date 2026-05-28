import { NextResponse } from 'next/server'
import { createServerSupabaseClient } from '@/lib/supabase-server'

export async function POST(request: Request) {
  const supabase = createServerSupabaseClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) {
    return NextResponse.json({ error: 'You must be signed in to list a vessel.' }, { status: 401 })
  }

  let body: Record<string, string>
  try {
    body = await request.json()
  } catch {
    return NextResponse.json({ error: 'Invalid JSON' }, { status: 400 })
  }

  const { vessel_name, operator_name, mmsi, length_m, main_activity } = body

  if (!vessel_name?.trim() || !operator_name?.trim()) {
    return NextResponse.json({ error: 'Vessel name and operator are required.' }, { status: 400 })
  }
  if (mmsi?.trim() && !/^\d{9}$/.test(mmsi.trim())) {
    return NextResponse.json({ error: 'MMSI must be exactly 9 digits.' }, { status: 400 })
  }
  if (!main_activity?.trim()) {
    return NextResponse.json({ error: 'Research activity description is required.' }, { status: 400 })
  }

  const num = (v: string | undefined) => (v?.trim() ? parseFloat(v) : null)
  const int = (v: string | undefined) => (v?.trim() ? parseInt(v, 10) : null)
  const str = (v: string | undefined) => v?.trim() || null

  const { error } = await supabase.from('vessel_submissions').insert({
    user_id: user.id,
    vessel_name: vessel_name.trim(),
    operator_name: operator_name.trim(),
    email: (user.email ?? '').toLowerCase(),
    port_city: str(body.port_city),
    port_state: str(body.port_state),
    country: str(body.country),
    mmsi: str(mmsi),
    imo_number: str(body.imo_number),
    call_sign: str(body.call_sign),
    year_built: int(body.year_built),
    year_refit: int(body.year_refit),
    length_m: num(length_m),
    beam_m: num(body.beam_m),
    draft_m: num(body.draft_m),
    speed_cruise: num(body.speed_cruise),
    speed_max: num(body.speed_max),
    scientists: int(body.scientists),
    crew: int(body.crew),
    endurance: str(body.endurance),
    main_activity: main_activity.trim(),
    operating_area: str(body.operating_area),
    dpos: str(body.dpos),
    ice_breaking: str(body.ice_breaking),
    url_ship: str(body.url_ship),
  })

  if (error) {
    console.error('vessel_submissions insert error:', error)
    return NextResponse.json({ error: 'Failed to submit. Please try again.' }, { status: 500 })
  }

  return NextResponse.json({ success: true }, { status: 201 })
}
