import { NextResponse } from 'next/server'
import { createServerSupabaseClient } from '@/lib/supabase-server'
import { supabaseAdmin } from '@/lib/supabase-admin'
import { notifyAdmins } from '@/lib/admin-notify'
import { newClaimAdminEmail } from '@/lib/brevo'

// Claiming IS becoming an operator: this inserts the vessel_operators row
// directly (vessel_claims is legacy, read-only). First claimant of an
// unclaimed vessel is 'active' immediately — admin review confirms or
// suspends afterwards instead of gating access. A vessel that already has
// any membership row gets a 'pending' one, so an actively managed listing
// can't be hijacked by a second claimant. Signup-path claims follow the
// same rule in handle_new_user.
export async function POST(request: Request) {
  const serverClient = createServerSupabaseClient()
  const { data: { user } } = await serverClient.auth.getUser()

  if (!user) {
    return NextResponse.json({ error: 'You must be signed in to claim a vessel.' }, { status: 401 })
  }

  // Pull identity from profile — not from request body
  const { data: profile } = await supabaseAdmin
    .from('profiles')
    .select('first_name, last_name, institution, title, email')
    .eq('id', user.id)
    .single()

  let body: Record<string, unknown>
  try {
    body = await request.json()
  } catch {
    return NextResponse.json({ error: 'Invalid JSON' }, { status: 400 })
  }

  const { vessel_id, vessel_name, message, document_url } = body as Record<string, string>

  if (!vessel_id || !vessel_name?.trim() || !message?.trim()) {
    return NextResponse.json({ error: 'vessel_id, vessel_name, and message are required.' }, { status: 400 })
  }

  const vesselIdNum = parseInt(String(vessel_id), 10)
  const claimantName = [profile?.first_name, profile?.last_name].filter(Boolean).join(' ') || 'Unknown'
  const email = profile?.email ?? user.email ?? ''

  const { count: existingRows } = await supabaseAdmin
    .from('vessel_operators')
    .select('*', { count: 'exact', head: true })
    .eq('vessel_id', vesselIdNum)

  const status = (existingRows ?? 0) === 0 ? 'active' : 'pending'

  const { error } = await supabaseAdmin.from('vessel_operators').upsert(
    {
      user_id: user.id,
      vessel_id: vesselIdNum,
      status,
      claim_message: message.trim(),
      claim_document_url: document_url ?? null,
    },
    { onConflict: 'user_id,vessel_id', ignoreDuplicates: true },
  )

  if (error) {
    console.error('vessel_operators claim insert error:', error)
    return NextResponse.json({ error: 'Failed to submit claim. Please try again.' }, { status: 500 })
  }

  // The upsert ignores duplicates, so a re-claim keeps whatever standing the
  // user already has — report their actual row status, not the computed one.
  const { data: row } = await supabaseAdmin
    .from('vessel_operators')
    .select('status')
    .eq('user_id', user.id)
    .eq('vessel_id', vesselIdNum)
    .single()
  const instant = row?.status === 'active'

  const adminUrl = `${process.env.NEXT_PUBLIC_SITE_URL ?? ''}/admin?tab=claims`
  await notifyAdmins(
    'new_claim',
    `${claimantName} claimed ${vessel_name.trim()}${instant ? ' (access granted — please confirm)' : ' (awaiting activation)'}`,
    newClaimAdminEmail(
      vessel_name.trim(),
      claimantName,
      email,
      profile?.title ?? '',
      profile?.institution ?? '',
      message.trim(),
      adminUrl,
    ),
  )

  return NextResponse.json({ success: true, instant }, { status: 201 })
}
