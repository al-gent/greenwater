import { NextResponse } from 'next/server'
import { createServerSupabaseClient } from '@/lib/supabase-server'

export async function GET(request: Request) {
  const viewer = createServerSupabaseClient()
  const { data: { user } } = await viewer.auth.getUser()
  if (!user) return NextResponse.json({ error: 'Sign in to search the directory' }, { status: 401 })
  const term = new URL(request.url).searchParams.get('q')?.trim() ?? ''
  if (!term || term.length > 200) return NextResponse.json({ people: [] })
  const literal = term.replace(/[\\%_]/g, '\\$&')
  const { data, error } = await viewer.from('people').select('id,name,affiliation').neq('source', 'demo')
    .ilike('name', `%${literal}%`).order('name').order('id').limit(12)
  if (error) return NextResponse.json({ error: 'Directory search unavailable' }, { status: 503 })
  return NextResponse.json({ people: data }, { headers: { 'Cache-Control': 'private, no-store' } })
}
