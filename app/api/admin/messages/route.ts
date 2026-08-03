import { NextResponse } from 'next/server'
import { createServerSupabaseClient } from '@/lib/supabase-server'
import { supabaseAdmin } from '@/lib/supabase-admin'

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

  const { data: messages, error } = await supabaseAdmin
    .from('messages')
    .select('id, thread_id, vessel_id, author_id, author_role, body, status, created_at, notified_via, notified_email, delivery_status')
    .order('created_at', { ascending: false })
    .limit(200)
  if (error) return NextResponse.json({ error: error.message }, { status: 500 })

  const authorIds = [...new Set((messages ?? []).map((m) => m.author_id))]
  const vesselIds = [...new Set((messages ?? []).map((m) => m.vessel_id))]

  const [{ data: profiles }, { data: vessels }] = await Promise.all([
    authorIds.length
      ? supabaseAdmin.from('profiles').select('id, first_name, last_name, institution, email').in('id', authorIds)
      : Promise.resolve({ data: [] }),
    vesselIds.length
      ? supabaseAdmin.from('vessels').select('id, name').in('id', vesselIds)
      : Promise.resolve({ data: [] }),
  ])

  const profileMap = new Map((profiles ?? []).map((p) => [p.id, p]))
  const vesselMap = new Map((vessels ?? []).map((v) => [v.id, v.name]))

  const enriched = (messages ?? []).map((m) => {
    const p = profileMap.get(m.author_id)
    return {
      ...m,
      is_root: m.thread_id === m.id,
      author_name: p ? [p.first_name, p.last_name].filter(Boolean).join(' ') || null : null,
      author_email: p?.email ?? null,
      author_institution: p?.institution ?? null,
      vessel_name: vesselMap.get(m.vessel_id) ?? `Vessel #${m.vessel_id}`,
    }
  })

  return NextResponse.json(enriched)
}
