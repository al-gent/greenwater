import { NextRequest, NextResponse } from 'next/server'
import { supabaseAdmin } from '@/lib/supabase-admin'

export async function GET(request: NextRequest) {
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
