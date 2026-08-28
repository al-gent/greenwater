import { NextResponse } from 'next/server'
import { createServerSupabaseClient } from '@/lib/supabase-server'
import { supabaseAdmin, supabaseAdminAs } from '@/lib/supabase-admin'
import { sendEmail, claimApprovedEmail, claimRejectedEmail } from '@/lib/brevo'

// Operator memberships admin API (route path kept from the claims era).
// A membership row IS the claim: review is non-blocking — confirm/suspend/
// remove act on standing access instead of gating it.

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

export async function GET() {
  const admin = await checkAdmin()
  if (!admin) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const { data: rows, error } = await supabaseAdmin
    .from('vessel_operators')
    .select('id, user_id, vessel_id, status, claim_message, claim_document_url, confirmed_at, admin_notes, created_at')
    .order('created_at', { ascending: false })

  if (error) return NextResponse.json({ error: error.message }, { status: 500 })

  const userIds = [...new Set((rows ?? []).map((r) => r.user_id as string))]
  const vesselIds = [...new Set((rows ?? []).map((r) => r.vessel_id as number))]
  const [{ data: profiles }, { data: vessels }] = await Promise.all([
    userIds.length
      ? supabaseAdmin.from('profiles').select('id, email, first_name, last_name, institution, title').in('id', userIds)
      : Promise.resolve({ data: [] }),
    vesselIds.length
      ? supabaseAdmin.from('vessels').select('id, name').in('id', vesselIds)
      : Promise.resolve({ data: [] }),
  ])
  const profileById = new Map((profiles ?? []).map((p) => [p.id, p]))
  const vesselById = new Map((vessels ?? []).map((v) => [v.id, v]))

  const result = (rows ?? []).map((r) => {
    const p = profileById.get(r.user_id)
    return {
      id: r.id,
      user_id: r.user_id,
      vessel_id: r.vessel_id,
      vessel_name: vesselById.get(r.vessel_id)?.name ?? `Vessel #${r.vessel_id}`,
      claimant_name: [p?.first_name, p?.last_name].filter(Boolean).join(' ') || 'Unknown',
      email: p?.email ?? '',
      role: p?.title ?? '',
      organization: p?.institution ?? '',
      message: r.claim_message,
      document_url: r.claim_document_url,
      status: r.status,
      confirmed_at: r.confirmed_at,
      admin_notes: r.admin_notes,
      created_at: r.created_at,
    }
  })

  return NextResponse.json(result)
}

type Action = 'confirm' | 'activate' | 'suspend' | 'reinstate' | 'remove'

export async function PATCH(request: Request) {
  const admin = await checkAdmin()
  if (!admin) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const { id, action, admin_notes } = await request.json()

  if (!id || !['confirm', 'activate', 'suspend', 'reinstate', 'remove'].includes(action)) {
    return NextResponse.json({ error: 'Invalid payload' }, { status: 400 })
  }

  const db = supabaseAdminAs(admin.email ?? admin.id)

  const { data: row, error: fetchError } = await supabaseAdmin
    .from('vessel_operators')
    .select('id, user_id, vessel_id, status, confirmed_at')
    .eq('id', id)
    .single()

  if (fetchError || !row) {
    return NextResponse.json({ error: 'Membership not found' }, { status: 404 })
  }

  const [{ data: profile }, { data: vessel }] = await Promise.all([
    supabaseAdmin.from('profiles').select('email').eq('id', row.user_id).single(),
    supabaseAdmin.from('vessels').select('name').eq('id', row.vessel_id).single(),
  ])
  const operatorEmail = profile?.email ?? ''
  const vesselName = vessel?.name ?? `Vessel #${row.vessel_id}`

  const notes = admin_notes ?? null
  const now = new Date().toISOString()

  let updates: Record<string, unknown> | null = null
  switch (action as Action) {
    case 'confirm':   // active + unreviewed -> reviewed
    case 'activate':  // pending -> active (this is the old "approve")
      updates = { status: 'active', confirmed_at: now, confirmed_by: admin.id, admin_notes: notes }
      break
    case 'suspend':   // reversible freeze — editing/uploads/badges stop
      updates = { status: 'suspended', admin_notes: notes }
      break
    case 'reinstate': // suspended -> active again (keeps original confirmation)
      updates = { status: 'active', admin_notes: notes }
      break
    case 'remove':
      updates = null
      break
  }

  if (updates) {
    const { error } = await db.from('vessel_operators').update(updates).eq('id', id)
    if (error) return NextResponse.json({ error: error.message }, { status: 500 })
  } else {
    const { error } = await db.from('vessel_operators').delete().eq('id', id)
    if (error) return NextResponse.json({ error: error.message }, { status: 500 })
  }

  // Confirming/activating is identity vetting — mark the profile verified.
  if (action === 'confirm' || action === 'activate') {
    await db.from('profiles').update({ verified: true }).eq('id', row.user_id)
  }

  // Email the operator on decisions they'd notice. 'confirm' is silent — they
  // already have access and nothing changes for them.
  const dashboardUrl = `${process.env.NEXT_PUBLIC_SITE_URL ?? ''}/dashboard`
  try {
    if ((action === 'activate' || action === 'reinstate') && operatorEmail) {
      await sendEmail({
        to: operatorEmail,
        subject: `Your vessel claim has been approved — Greenwater Foundation`,
        html: claimApprovedEmail(vesselName, dashboardUrl),
      })
    } else if ((action === 'suspend' || action === 'remove') && operatorEmail) {
      await sendEmail({
        to: operatorEmail,
        subject: `Update on your vessel claim — Greenwater Foundation`,
        html: claimRejectedEmail(vesselName, notes ?? ''),
      })
    }
  } catch (e) {
    console.error('Brevo email error:', e)
  }

  return NextResponse.json({ success: true, status: updates ? (updates.status as string) : 'removed', confirmed_at: updates?.confirmed_at ?? row.confirmed_at })
}
