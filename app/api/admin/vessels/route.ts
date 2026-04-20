import { NextRequest, NextResponse } from 'next/server'
import { createServerSupabaseClient } from '@/lib/supabase-server'
import { supabaseAdmin } from '@/lib/supabase-admin'

const VALID_STATUSES = ['active', 'retired', 'inactive', 'deleted'] as const
type VesselStatus = typeof VALID_STATUSES[number]

async function checkAdmin() {
  const supabase = createServerSupabaseClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return null
  const { data: profile } = await supabaseAdmin
    .from('profiles')
    .select('role')
    .eq('id', user.id)
    .single()
  return profile?.role === 'admin' ? user : null
}

export async function GET() {
  const admin = await checkAdmin()
  if (!admin) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const { data, error } = await supabaseAdmin
    .from('vessels')
    .select('id, name, country, port_city, status, year_built, scientists, length, speed_cruise, operator_name')
    .order('name')

  if (error) return NextResponse.json({ error: error.message }, { status: 500 })
  return NextResponse.json(data)
}

export async function PATCH(request: NextRequest) {
  const admin = await checkAdmin()
  if (!admin) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  let body: unknown
  try {
    body = await request.json()
  } catch {
    return NextResponse.json({ error: 'Invalid JSON' }, { status: 400 })
  }

  const { id, status } = body as { id?: unknown; status?: unknown }

  if (typeof id !== 'number' || !VALID_STATUSES.includes(status as VesselStatus)) {
    return NextResponse.json(
      { error: 'Expected: { id: number, status: active|retired|inactive|deleted }' },
      { status: 400 }
    )
  }

  const { error } = await supabaseAdmin
    .from('vessels')
    .update({ status })
    .eq('id', id)

  if (error) return NextResponse.json({ error: error.message }, { status: 500 })
  return NextResponse.json({ success: true })
}
