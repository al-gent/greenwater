import { NextResponse } from 'next/server'
import { isUuid } from '@/lib/project-utils'
import { projectWriteError } from '@/lib/project-write-errors'
import { supabaseAdmin } from '@/lib/supabase-admin'
import { createServerSupabaseClient } from '@/lib/supabase-server'

async function adminSession() {
  const viewer = createServerSupabaseClient()
  const { data: { user } } = await viewer.auth.getUser()
  if (!user) return { denied: NextResponse.json({ error: 'Sign in required.' }, { status: 401 }) }
  const { data } = await viewer.from('profiles').select('is_admin').eq('id', user.id).maybeSingle()
  if (!data?.is_admin) return { denied: NextResponse.json({ error: 'Admin access required.' }, { status: 403 }) }
  return { user }
}

export async function GET() {
  const { denied } = await adminSession()
  if (denied) return denied
  const { data, error } = await supabaseAdmin.from('person_link_requests')
    .select('id,note,created_at,verified_account_email,member:profiles!profile_id(first_name,last_name,institution,title),person:people(name,email,affiliation,organization:organizations(name))')
    .eq('status', 'pending').order('created_at').order('id').limit(50)
  if (error) return NextResponse.json({ error: 'The review queue could not be loaded.' }, { status: 503 })
  return NextResponse.json(data, { headers: { 'Cache-Control': 'private, no-store' } })
}

export async function PATCH(request: Request) {
  const { user, denied } = await adminSession()
  if (denied) return denied
  const body = await request.json().catch(() => null)
  if (typeof body?.id !== 'string' || !isUuid(body.id) || !['confirmed', 'declined'].includes(body.status)) {
    return NextResponse.json({ error: 'Invalid review decision.' }, { status: 400 })
  }
  const { error } = await supabaseAdmin.rpc('review_person_link', { p_admin: user.id, p_request: body.id, p_status: body.status })
  if (error) {
    const result = projectWriteError(error)
    return NextResponse.json({ error: result.error }, { status: result.status })
  }
  return NextResponse.json({ status: body.status })
}
