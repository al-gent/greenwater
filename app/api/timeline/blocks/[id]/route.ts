import { NextResponse } from 'next/server'
import { createServerSupabaseClient } from '@/lib/supabase-server'
import { supabaseAdmin } from '@/lib/supabase-admin'
import { canOperateVessel } from '@/lib/operators'
import { removeEntry } from '@/lib/timeline-service'

// Remove a block (soft delete). Operators of its vessel, or admins.
export async function DELETE(_request: Request, { params }: { params: { id: string } }) {
  const { data: { user } } = await createServerSupabaseClient().auth.getUser()
  if (!user) return NextResponse.json({ error: 'Not signed in' }, { status: 401 })
  const { data: entry } = await supabaseAdmin.from('timeline_entries').select('id, vessel_id, cruise_id').eq('id', params.id).is('deleted_at', null).maybeSingle()
  if (!entry || !entry.vessel_id) return NextResponse.json({ error: 'Not found' }, { status: 404 })
  if (entry.cruise_id) return NextResponse.json({ error: 'That is a cruise, not a block' }, { status: 409 })
  const { data: profile } = await supabaseAdmin.from('profiles').select('is_admin').eq('id', user.id).single()
  if (!profile?.is_admin && !(await canOperateVessel(user.id, entry.vessel_id))) return NextResponse.json({ error: 'Forbidden' }, { status: 403 })
  await removeEntry(params.id)
  return NextResponse.json({ ok: true })
}
