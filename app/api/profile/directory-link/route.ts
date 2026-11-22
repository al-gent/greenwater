import { NextResponse } from 'next/server'
import { isUuid } from '@/lib/project-utils'
import { projectWriteError } from '@/lib/project-write-errors'
import { supabaseAdmin } from '@/lib/supabase-admin'
import { createServerSupabaseClient } from '@/lib/supabase-server'

export async function GET() {
  const viewer = createServerSupabaseClient()
  const { data: { user } } = await viewer.auth.getUser()
  if (!user) return NextResponse.json({ error: 'Sign in to view your directory record.' }, { status: 401 })
  const [person, latest] = await Promise.all([
    viewer.from('people').select('id,name,affiliation').eq('profile_id', user.id).maybeSingle(),
    viewer.from('person_link_requests').select('status,person:people(name)').eq('profile_id', user.id)
      .order('created_at', { ascending: false }).limit(1).maybeSingle(),
  ])
  // A deployment may have the people directory before profile-link requests ship.
  const linkingUnavailable = latest.error?.code === 'PGRST205' || latest.error?.code === '42P01'
  if (person.error || (latest.error && !linkingUnavailable)) return NextResponse.json({ error: 'Your directory link could not be loaded.' }, { status: 503 })
  const work = person.data ? await viewer.rpc('my_person_work_credits') : null
  const creditsUnavailable = work?.error?.code === 'PGRST202' || work?.error?.code === '42883'
  if (work?.error && !creditsUnavailable) return NextResponse.json({ error: 'Your work history could not be loaded.' }, { status: 503 })
  return NextResponse.json({ person: person.data, request: latest.data, credits: work?.data ?? [], linkingUnavailable, creditsUnavailable }, { headers: { 'Cache-Control': 'private, no-store' } })
}

export async function POST(request: Request) {
  const viewer = createServerSupabaseClient()
  const { data: { user } } = await viewer.auth.getUser()
  if (!user) return NextResponse.json({ error: 'Sign in to request a link.' }, { status: 401 })
  const body = await request.json().catch(() => null)
  if (typeof body?.personId !== 'string' || !isUuid(body.personId) || typeof body.note !== 'string' || body.note.length > 800) {
    return NextResponse.json({ error: 'Choose a directory record and keep your note under 801 characters.' }, { status: 400 })
  }
  const { error } = await supabaseAdmin.rpc('request_person_link', { p_member: user.id, p_person: body.personId, p_note: body.note, p_verified_email: user.email_confirmed_at ? user.email ?? null : null })
  if (error) {
    const result = projectWriteError(error)
    return NextResponse.json({ error: result.error }, { status: result.status })
  }
  return NextResponse.json({ status: 'pending' })
}
