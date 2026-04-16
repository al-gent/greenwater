import { NextRequest, NextResponse } from 'next/server'
import { supabaseAdmin } from '@/lib/supabase-admin'

function isAuthorized(request: NextRequest): boolean {
  const auth = request.headers.get('authorization') ?? ''
  const token = auth.startsWith('Bearer ') ? auth.slice(7) : ''
  return token === process.env.MIGRATION_API_SECRET
}

interface UserPayload {
  id: number
  status: string
  firstName: string
  lastName: string
  email: string
  shipIds: number[]
}

function isValidPayload(body: unknown): body is UserPayload {
  if (!body || typeof body !== 'object') return false
  const b = body as Record<string, unknown>
  return (
    typeof b.id === 'number' &&
    typeof b.status === 'string' &&
    typeof b.firstName === 'string' &&
    typeof b.lastName === 'string' &&
    typeof b.email === 'string' &&
    Array.isArray(b.shipIds) &&
    b.shipIds.every((s) => typeof s === 'number')
  )
}

export async function POST(request: NextRequest) {
  if (!isAuthorized(request)) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }

  let body: unknown
  try {
    body = await request.json()
  } catch {
    return NextResponse.json({ error: 'Invalid JSON' }, { status: 400 })
  }

  if (!isValidPayload(body)) {
    return NextResponse.json(
      { error: 'Invalid payload. Expected: { id, status, firstName, lastName, email, shipIds }' },
      { status: 400 }
    )
  }

  // Check for duplicate by external_id
  const { data: existing } = await supabaseAdmin
    .from('user_migrations')
    .select('id')
    .eq('external_id', body.id)
    .single()

  if (existing) {
    return NextResponse.json({ error: 'User already queued for migration', id: body.id }, { status: 409 })
  }

  const { error } = await supabaseAdmin
    .from('user_migrations')
    .insert({
      external_id: body.id,
      status: body.status,
      first_name: body.firstName,
      last_name: body.lastName,
      email: body.email,
      ship_ids: body.shipIds,
      migration_status: 'pending',
    })

  if (error) {
    console.error('user_migrations insert error:', error)
    return NextResponse.json({ error: 'Failed to store user.' }, { status: 500 })
  }

  return NextResponse.json({ success: true, email: body.email }, { status: 201 })
}
