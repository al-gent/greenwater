import { NextResponse } from 'next/server'
import { createServerSupabaseClient } from '@/lib/supabase-server'
import { supabaseAdmin } from '@/lib/supabase-admin'
import { sendEmail, scientistApprovedEmail, scientistRejectedEmail } from '@/lib/brevo'

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

  const { data, error } = await supabaseAdmin
    .from('profiles')
    .select('id, email, first_name, last_name, institution, title, profile_url, verified, created_at')
    .eq('role', 'scientist')
    .order('created_at', { ascending: false })

  if (error) return NextResponse.json({ error: error.message }, { status: 500 })
  return NextResponse.json(data)
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
    const { error } = await supabaseAdmin
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
