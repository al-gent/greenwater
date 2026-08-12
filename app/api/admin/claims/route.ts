import { NextResponse } from 'next/server'
import { createServerSupabaseClient } from '@/lib/supabase-server'
import { supabaseAdmin, supabaseAdminAs } from '@/lib/supabase-admin'
import { sendEmail, claimApprovedEmail, claimRejectedEmail } from '@/lib/brevo'

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

  const { data, error } = await supabaseAdmin
    .from('vessel_claims')
    .select('*')
    .order('created_at', { ascending: false })

  if (error) return NextResponse.json({ error: error.message }, { status: 500 })
  return NextResponse.json(data)
}

export async function PATCH(request: Request) {
  const admin = await checkAdmin()
  if (!admin) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const { id, status, admin_notes } = await request.json()

  if (!id || !['approved', 'rejected'].includes(status)) {
    return NextResponse.json({ error: 'Invalid payload' }, { status: 400 })
  }

  const db = supabaseAdminAs(admin.email ?? admin.id)

  // Fetch the claim
  const { data: claim, error: fetchError } = await supabaseAdmin
    .from('vessel_claims')
    .select('*')
    .eq('id', id)
    .single()

  if (fetchError || !claim) {
    return NextResponse.json({ error: 'Claim not found' }, { status: 404 })
  }

  // Update claim status
  const { error } = await db
    .from('vessel_claims')
    .update({ status, admin_notes: admin_notes ?? null, reviewed_at: new Date().toISOString() })
    .eq('id', id)

  if (error) return NextResponse.json({ error: error.message }, { status: 500 })

  // On approval: grant a vessel_operators membership. Operator-ness is a
  // per-vessel fact, not a role — profiles.role is never touched, so this
  // works identically for scientists, existing operators, and admins, and a
  // second approved claim on the same vessel just adds another operator.
  if (status === 'approved' && claim.user_id) {
    const { error: membershipError } = await db
      .from('vessel_operators')
      .upsert(
        { user_id: claim.user_id, vessel_id: claim.vessel_id },
        { onConflict: 'user_id,vessel_id', ignoreDuplicates: true },
      )

    if (membershipError) {
      console.error('Failed to grant membership on claim approval:', membershipError)
      // Roll back claim status
      await db
        .from('vessel_claims')
        .update({ status: 'pending', admin_notes: null, reviewed_at: null })
        .eq('id', id)
      return NextResponse.json({ error: 'Failed to grant operator access. Approval was not saved.' }, { status: 500 })
    }

    // Approving a claim IS identity vetting — grant verified so operators
    // can also send inquiries about other vessels.
    await db.from('profiles').update({ verified: true }).eq('id', claim.user_id)
  }

  // Send Brevo email
  const dashboardUrl = `${process.env.NEXT_PUBLIC_SITE_URL ?? ''}/dashboard`
  try {
    if (status === 'approved') {
      await sendEmail({
        to: claim.email,
        subject: `Your vessel claim has been approved — Greenwater Foundation`,
        html: claimApprovedEmail(claim.vessel_name, dashboardUrl),
      })
    } else {
      await sendEmail({
        to: claim.email,
        subject: `Update on your vessel claim — Greenwater Foundation`,
        html: claimRejectedEmail(claim.vessel_name, admin_notes ?? ''),
      })
    }
  } catch (e) {
    console.error('Brevo email error:', e)
  }

  return NextResponse.json({ success: true })
}
