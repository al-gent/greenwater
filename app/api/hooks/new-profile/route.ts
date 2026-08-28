import { NextResponse } from 'next/server'
import { supabaseAdmin } from '@/lib/supabase-admin'
import { notifyAdmins } from '@/lib/admin-notify'
import { newClaimAdminEmail, newUserAdminEmail } from '@/lib/brevo'

// Admin email only. The profile and any vessel claim are written in SQL by
// handle_new_user; nothing here is load-bearing for the user's data, so a
// dropped delivery costs a notification rather than a claim.
//
// Supabase Database Webhook target: fires on INSERT into public.profiles,
// i.e. the moment anyone signs up (the profiles row is created by the
// handle_new_user trigger at signup — before email confirmation). Replaces
// the old /auth/callback notification hook, which missed users whose
// confirmation link opened in a different browser than they signed up in.
// Trigger: supabase/migrations/20260808_new_profile_webhook.sql

interface ProfileRecord {
  id: string
  email: string | null
  first_name: string | null
  last_name: string | null
  institution: string | null
  title: string | null
}

export async function POST(request: Request) {
  const secret = process.env.SUPABASE_WEBHOOK_SECRET
  if (!secret || request.headers.get('x-webhook-secret') !== secret) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }

  let payload: { type?: string; table?: string; record?: ProfileRecord }
  try {
    payload = await request.json()
  } catch {
    return NextResponse.json({ error: 'Invalid JSON' }, { status: 400 })
  }

  const record = payload.record
  if (payload.type !== 'INSERT' || payload.table !== 'profiles' || !record?.id) {
    return NextResponse.json({ error: 'Unexpected payload' }, { status: 400 })
  }

  // account_type and pending_claim live in auth metadata, not on profiles
  const { data: userData } = await supabaseAdmin.auth.admin.getUserById(record.id)
  const metadata = userData?.user?.user_metadata ?? {}

  const name = [record.first_name, record.last_name].filter(Boolean).join(' ') || 'Unknown'
  const email = record.email ?? userData?.user?.email ?? ''
  const accountType = String(metadata.account_type ?? 'researcher')
  const siteUrl = process.env.NEXT_PUBLIC_SITE_URL ?? ''

  await notifyAdmins(
    'new_signup',
    `${name} signed up as a ${accountType === 'vessel' ? 'vessel operator' : 'researcher'}`,
    newUserAdminEmail(
      name,
      email,
      accountType,
      record.institution ?? '',
      record.title ?? '',
      `${siteUrl}/admin${accountType !== 'vessel' ? '?tab=scientists' : ''}`,
    ),
  )

  // The claim itself is the vessel_operators row written in SQL by
  // handle_new_user, in the same transaction as the profile. Read back what
  // actually landed rather than trusting signup metadata, so the email always
  // describes a membership that really exists.
  const { data: membership } = await supabaseAdmin
    .from('vessel_operators')
    .select('vessel_id, status, claim_message')
    .eq('user_id', record.id)
    .order('created_at', { ascending: false })
    .limit(1)
    .maybeSingle()

  if (membership) {
    const { data: vessel } = await supabaseAdmin
      .from('vessels')
      .select('name')
      .eq('id', membership.vessel_id)
      .single()
    const vesselName = vessel?.name ?? `Vessel #${membership.vessel_id}`
    await notifyAdmins(
      'new_claim',
      `Another vessel claimed! 🎉`,
      newClaimAdminEmail(
        vesselName,
        name,
        email,
        record.title ?? '',
        record.institution ?? '',
        membership.claim_message ?? '',
        `${siteUrl}/admin?tab=claims`,
      ),
    )
  }

  return NextResponse.json({ ok: true })
}
