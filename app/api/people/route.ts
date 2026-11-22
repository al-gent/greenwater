import { NextResponse } from 'next/server'
import { createServerSupabaseClient } from '@/lib/supabase-server'

export async function GET(request: Request) {
  const viewer = createServerSupabaseClient()
  const { data: { user } } = await viewer.auth.getUser()
  if (!user) return NextResponse.json({ error: 'Sign in to search the directory' }, { status: 401 })
  const params = new URL(request.url).searchParams
  const term = params.get('q')?.trim() ?? ''
  if (!term || term.length > 200) return NextResponse.json({ people: [] })
  const literal = term.replace(/[\\%_]/g, '\\$&')
  if (params.get('purpose') === 'profile-link') {
    const { data, error } = await viewer.from('people')
      .select('id,name,affiliation,organization:organizations(name),projects:project_people(project:projects(title)),cruises:cruise_people(cruise:cruises(title))')
      .neq('source', 'demo').is('profile_id', null).ilike('name', `%${literal}%`)
      .is('cruises.deleted_at', null).limit(1, { referencedTable: 'projects' }).limit(1, { referencedTable: 'cruises' })
      .order('name').order('id').limit(12)
    if (error) return NextResponse.json({ error: 'Directory search unavailable' }, { status: 503 })
    return NextResponse.json({ people: data }, { headers: { 'Cache-Control': 'private, no-store' } })
  }
  const { data, error } = await viewer.from('people').select('id,name,affiliation').neq('source', 'demo')
    .ilike('name', `%${literal}%`).order('name').order('id').limit(12)
  if (error) return NextResponse.json({ error: 'Directory search unavailable' }, { status: 503 })
  return NextResponse.json({ people: data }, { headers: { 'Cache-Control': 'private, no-store' } })
}
