import { NextResponse } from 'next/server'
import { getServerUser } from '@/lib/supabase-server'
import { supabaseAdmin } from '@/lib/supabase-admin'
import { isUuid } from '@/lib/project-utils'
import { projectWriteError } from '@/lib/project-write-errors'

export async function POST(request: Request, { params }: { params: { id: string } }) {
  const user = await getServerUser()
  if (!user) return NextResponse.json({ error: 'Sign in to manage vessel people' }, { status: 401 })
  const vessel = Number(params.id)
  const body = await request.json().catch(() => null)
  const date = (v: unknown) => v == null || (typeof v === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(v))
  if (!Number.isSafeInteger(vessel) || vessel < 1 || !body?.person || typeof body.role !== 'string' || !body.role.trim() || body.role.trim().length > 100 ||
    (body.id != null && (typeof body.id !== 'string' || !isUuid(body.id))) || !date(body.starts_on) || !date(body.ends_on) ||
    (body.starts_on && body.ends_on && body.ends_on < body.starts_on)) return NextResponse.json({ error: 'Check the vessel role and dates' }, { status: 400 })
  const { data, error } = await supabaseAdmin.rpc('save_vessel_person', { p_actor: user.id, p_vessel: vessel, p_id: body.id ?? null,
    p_choice: body.person, p_role: body.role.trim(), p_start: body.starts_on ?? null, p_end: body.ends_on ?? null })
  if (error) {
    if (error.code === '23P01') return NextResponse.json({ error: 'This person already has that role on this vessel during those dates' }, { status: 409 })
    const failure = projectWriteError(error)
    return NextResponse.json({ error: failure.error }, { status: failure.status })
  }
  return NextResponse.json({ id: data })
}
