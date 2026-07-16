import { NextResponse } from 'next/server'
import { createServerSupabaseClient } from '@/lib/supabase-server'
import { supabaseAdmin } from '@/lib/supabase-admin'
import { notifyAdmins } from '@/lib/admin-notify'
import { newUserAdminEmail } from '@/lib/brevo'

export async function GET(request: Request) {
  const { searchParams, origin } = new URL(request.url)
  const code = searchParams.get('code')
  const next = searchParams.get('next') ?? '/'

  if (code) {
    const supabase = createServerSupabaseClient()
    const { data, error } = await supabase.auth.exchangeCodeForSession(code)
    if (!error) {
      await maybeNotifyNewSignup(data.user)
      return NextResponse.redirect(`${origin}${next}`)
    }
  }

  return NextResponse.redirect(`${origin}/auth/signin?error=confirmation_failed`)
}

// Email admins on a user's FIRST confirmation. Signups never touch our server
// (browser → Supabase Auth directly), so the confirmation callback is the first
// place we see a new user. First-time detection: on initial confirmation,
// email_confirmed_at and last_sign_in_at are set in the same moment; later
// visits through this route (password recovery) have a much older
// email_confirmed_at. The app has no email-change flow, so confirmed_at never
// resets.
async function maybeNotifyNewSignup(user: { id: string; email?: string; email_confirmed_at?: string; last_sign_in_at?: string; user_metadata?: Record<string, unknown> } | null) {
  try {
    if (!user?.email_confirmed_at || !user.last_sign_in_at) return
    const delta = Math.abs(
      new Date(user.last_sign_in_at).getTime() - new Date(user.email_confirmed_at).getTime(),
    )
    if (delta > 60_000) return

    const { data: profile } = await supabaseAdmin
      .from('profiles')
      .select('first_name, last_name, institution, title')
      .eq('id', user.id)
      .single()

    const name = [profile?.first_name, profile?.last_name].filter(Boolean).join(' ') || 'Unknown'
    const accountType = String(user.user_metadata?.account_type ?? 'researcher')
    const adminUrl = `${process.env.NEXT_PUBLIC_SITE_URL ?? ''}/admin${accountType !== 'vessel' ? '?tab=scientists' : ''}`

    await notifyAdmins(
      'new_signup',
      `New user signup: ${name}`,
      newUserAdminEmail(
        name,
        user.email ?? '',
        accountType,
        profile?.institution ?? '',
        profile?.title ?? '',
        adminUrl,
      ),
    )
  } catch (err) {
    console.error('new-signup notification failed:', err)
  }
}
