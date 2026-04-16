import { NextRequest, NextResponse } from 'next/server'
import { supabaseAdmin } from '@/lib/supabase-admin'

function isAuthorized(request: NextRequest): boolean {
  const auth = request.headers.get('authorization') ?? ''
  const token = auth.startsWith('Bearer ') ? auth.slice(7) : ''
  return token === process.env.MIGRATION_API_SECRET
}

export async function GET(request: NextRequest) {
  if (!isAuthorized(request)) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }

  const params = Object.fromEntries(request.nextUrl.searchParams.entries())

  const { error } = await supabaseAdmin
    .from('user_migrations')
    .insert({ data: params })

  if (error) {
    console.error('user_migrations insert error:', error)
    return NextResponse.json({ error: 'Failed to store data.' }, { status: 500 })
  }

  return NextResponse.json({ success: true }, { status: 201 })
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

  const { error } = await supabaseAdmin
    .from('user_migrations')
    .insert({ data: body })

  if (error) {
    console.error('user_migrations insert error:', error)
    return NextResponse.json({ error: 'Failed to store data.' }, { status: 500 })
  }

  return NextResponse.json({ success: true }, { status: 201 })
}
