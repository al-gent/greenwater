import { NextResponse } from 'next/server'
import { createServerSupabaseClient } from '@/lib/supabase-server'
import { supabaseAdmin } from '@/lib/supabase-admin'

async function me() {
  const { data: { user } } = await createServerSupabaseClient().auth.getUser()
  return user
}
const vesselOf = async (request: Request) => {
  const body = await request.json().catch(() => ({}))
  const id = Number(body?.vessel_id)
  return Number.isInteger(id) && id > 0 ? id : null
}

// Add a vessel to my fleet.
export async function POST(request: Request) {
  const user = await me()
  if (!user) return NextResponse.json({ error: 'Not signed in' }, { status: 401 })
  const vesselId = await vesselOf(request)
  if (!vesselId) return NextResponse.json({ error: 'vessel_id required' }, { status: 400 })
  const { error } = await supabaseAdmin.from('fleet_vessels').upsert({ user_id: user.id, vessel_id: vesselId }, { onConflict: 'user_id,vessel_id', ignoreDuplicates: true })
  if (error) return NextResponse.json({ error: error.code === '23503' ? 'No such vessel' : 'Could not add' }, { status: error.code === '23503' ? 404 : 500 })
  return NextResponse.json({ ok: true, in_fleet: true })
}

// Remove a vessel from my fleet.
export async function DELETE(request: Request) {
  const user = await me()
  if (!user) return NextResponse.json({ error: 'Not signed in' }, { status: 401 })
  const vesselId = await vesselOf(request)
  if (!vesselId) return NextResponse.json({ error: 'vessel_id required' }, { status: 400 })
  const { error } = await supabaseAdmin.from('fleet_vessels').delete().eq('user_id', user.id).eq('vessel_id', vesselId)
  if (error) return NextResponse.json({ error: 'Could not remove' }, { status: 500 })
  return NextResponse.json({ ok: true, in_fleet: false })
}
