import { NextResponse } from 'next/server'
import { createServerSupabaseClient } from '@/lib/supabase-server'
import { supabaseAdmin, supabaseAdminAs } from '@/lib/supabase-admin'
import { sendEmail, scientistApprovedEmail, scientistRejectedEmail } from '@/lib/brevo'

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

  // Every non-admin user is listed: verification gates messaging for
  // everyone. is_operator is derived from vessel_operators membership so the
  // UI can badge operator accounts.
  const [{ data, error }, { data: memberships }] = await Promise.all([
    supabaseAdmin
      .from('profiles')
      .select('id, email, first_name, last_name, institution, title, profile_url, verified, created_at')
      .eq('is_admin', false)
      .order('created_at', { ascending: false }),
    supabaseAdmin.from('vessel_operators').select('user_id'),
  ])

  if (error) return NextResponse.json({ error: error.message }, { status: 500 })
  const operatorIds = new Set((memberships ?? []).map((m) => m.user_id as string))
  return NextResponse.json((data ?? []).map((p) => ({ ...p, is_operator: operatorIds.has(p.id) })))
}

export async function PATCH(request: Request) {
  const admin = await checkAdmin()
  if (!admin) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const { id, action, notes } = await request.json()

  if (!id || !['approve', 'reject'].includes(action)) {
    return NextResponse.json({ error: 'Invalid payload' }, { status: 400 })
  }

  const { data: profile } = await supabaseAdmin
    .from('profiles')
    .select('email, first_name')
    .eq('id', id)
    .single()

  if (!profile) return NextResponse.json({ error: 'Scientist not found' }, { status: 404 })

  if (action === 'approve') {
    const { error } = await supabaseAdminAs(admin.email ?? admin.id)
      .from('profiles')
      .update({ verified: true })
      .eq('id', id)

    if (error) return NextResponse.json({ error: error.message }, { status: 500 })

    if (profile.email) {
      try {
        await sendEmail({
          to: profile.email,
          subject: 'Your Greenwater account has been verified!',
          html: scientistApprovedEmail(profile.first_name ?? 'there', notes),
        })
      } catch (e) {
        console.error('Brevo email error:', e)
      }
    }
  } else {
    // reject: leave verified = false, just send email
    if (profile.email) {
      try {
        await sendEmail({
          to: profile.email,
          subject: 'Update on your Greenwater verification — Greenwater Foundation',
          html: scientistRejectedEmail(profile.first_name ?? 'there', notes),
        })
      } catch (e) {
        console.error('Brevo email error:', e)
      }
    }
  }

  return NextResponse.json({ success: true })
}
