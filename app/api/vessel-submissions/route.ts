import { NextResponse } from 'next/server'
import { supabase } from '@/lib/supabase'

export async function POST(request: Request) {
  let body: Record<string, string>
  try {
    body = await request.json()
  } catch {
    return NextResponse.json({ error: 'Invalid JSON' }, { status: 400 })
  }

  const { vessel_name, operator_name, email, port_city, mmsi, imo_number, length_m, scientists, main_activity } = body

  // Required field validation
  if (!vessel_name?.trim() || !operator_name?.trim() || !email?.trim() || !port_city?.trim()) {
    return NextResponse.json({ error: 'Vessel name, operator, email, and port city are required.' }, { status: 400 })
  }
  if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
    return NextResponse.json({ error: 'Invalid email address.' }, { status: 400 })
  }
  if (!mmsi?.trim() && !imo_number?.trim()) {
    return NextResponse.json({ error: 'At least one of MMSI or IMO Number is required.' }, { status: 400 })
  }
  if (mmsi?.trim() && !/^\d{9}$/.test(mmsi.trim())) {
    return NextResponse.json({ error: 'MMSI must be exactly 9 digits.' }, { status: 400 })
  }
  if (!length_m?.trim()) {
    return NextResponse.json({ error: 'Vessel length is required.' }, { status: 400 })
  }
  if (!scientists?.trim()) {
    return NextResponse.json({ error: 'Number of research bunks is required.' }, { status: 400 })
  }
  if (!main_activity?.trim()) {
    return NextResponse.json({ error: 'Research activity description is required.' }, { status: 400 })
  }

  const num = (v: string | undefined) => (v?.trim() ? parseFloat(v) : null)
  const int = (v: string | undefined) => (v?.trim() ? parseInt(v, 10) : null)
  const str = (v: string | undefined) => v?.trim() || null

  const { error } = await supabase.from('vessel_submissions').insert({
    vessel_name: vessel_name.trim(),
    operator_name: operator_name.trim(),
    email: email.trim().toLowerCase(),
    port_city: port_city.trim(),
    port_state: str(body.port_state),
    country: str(body.country),
    mmsi: str(mmsi),
    imo_number: str(imo_number),
    call_sign: str(body.call_sign),
    year_built: int(body.year_built),
    year_refit: int(body.year_refit),
    length_m: num(length_m),
    beam_m: num(body.beam_m),
    draft_m: num(body.draft_m),
    speed_cruise: num(body.speed_cruise),
    speed_max: num(body.speed_max),
    scientists: int(scientists),
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
