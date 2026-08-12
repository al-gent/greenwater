import { NextResponse } from 'next/server'
import { createServerSupabaseClient } from '@/lib/supabase-server'
import { supabaseAdmin } from '@/lib/supabase-admin'

async function checkAdmin() {
  const supabase = createServerSupabaseClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return null
  const { data: profile } = await supabaseAdmin
    .from('profiles')
    .select('is_admin')
    .eq('id', user.id)
    .single()
  return profile?.is_admin === true ? user : null
}

const WINDOW_HOURS: Record<string, number> = {
  hour: 1, day: 24, week: 168, month: 720, year: 8760,
}
const HARD_CAP = 1000

// Audit-log feed (data_changes is RLS-locked; service role only).
//   ?window=hour (default) | day | week | month | year | all
//   ?q=<term> — server-side search across field/values/batch/table plus
//               vessel names and actor names (resolved to ids first),
//               scoped to the selected window
export async function GET(request: Request) {
  const admin = await checkAdmin()
  if (!admin) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const url = new URL(request.url)
  const windowParam = url.searchParams.get('window') ?? 'hour'
  // strip characters that would break PostgREST or() grammar
  const q = (url.searchParams.get('q') ?? '').trim().replace(/[(),%]/g, ' ').trim()

  let query = supabaseAdmin
    .from('data_changes')
    .select('id, vessel_id, table_name, record_id, field, old_value, new_value, source, batch, changed_at')
    .order('changed_at', { ascending: false })

  if (windowParam !== 'all') {
    const hours = WINDOW_HOURS[windowParam]
    if (!hours) return NextResponse.json({ error: 'bad window' }, { status: 400 })
    query = query.gte('changed_at', new Date(Date.now() - hours * 3600_000).toISOString())
  }
  query = query.limit(HARD_CAP)

  if (q) {
    const like = `%${q}%`
    // names live in other tables — resolve the term to ids first
    const [{ data: vs }, { data: ps }] = await Promise.all([
      supabaseAdmin.from('vessels').select('id').ilike('name', like).limit(200),
      supabaseAdmin.from('profiles').select('id').or(`first_name.ilike.${like},last_name.ilike.${like}`).limit(200),
    ])
    const parts = [
      `field.ilike.${like}`,
      `old_value.ilike.${like}`,
      `new_value.ilike.${like}`,
      `batch.ilike.${like}`,
      `table_name.ilike.${like}`,
    ]
    if (vs?.length) parts.push(`vessel_id.in.(${vs.map((v) => v.id).join(',')})`)
    if (ps?.length) parts.push(`source.in.(${ps.map((p) => p.id).join(',')})`)
    query = query.or(parts.join(','))
  }

  const { data: changes, error } = await query
  if (error) return NextResponse.json({ error: error.message }, { status: 500 })

  // Enrich for display: vessel names + actor names
  const vesselIds = [...new Set((changes ?? []).map((c) => c.vessel_id).filter(Boolean))]
  const { data: vessels } = vesselIds.length
    ? await supabaseAdmin.from('vessels').select('id, name').in('id', vesselIds)
    : { data: [] }
  const vesselMap = new Map((vessels ?? []).map((v) => [v.id, v.name]))

  const uuidRe = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i
  const actorIds = [...new Set((changes ?? []).map((c) => c.source).filter((s) => s && uuidRe.test(s)))]
  const { data: actors } = actorIds.length
    ? await supabaseAdmin.from('profiles').select('id, first_name, last_name, is_admin').in('id', actorIds)
    : { data: [] }
  const actorMap = new Map((actors ?? []).map((p) => [
    p.id,
    [p.first_name, p.last_name].filter(Boolean).join(' ') || `${p.is_admin ? 'admin' : 'user'} ${p.id.slice(0, 8)}`,
  ]))

  return NextResponse.json({
    capped: (changes ?? []).length >= HARD_CAP,
    changes: (changes ?? []).map((c) => ({
      ...c,
      vessel_name: c.vessel_id ? vesselMap.get(c.vessel_id) ?? null : null,
      actor: c.source && uuidRe.test(c.source) ? actorMap.get(c.source) ?? c.source.slice(0, 8) : c.source,
    })),
  })
}
