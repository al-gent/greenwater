import { NextResponse } from 'next/server'
import { createServerSupabaseClient } from '@/lib/supabase-server'

// New-signup side effects (admin notification, pending vessel claim) are NOT
// handled here — they run in /api/hooks/new-profile via a database webhook at
// signup time. This route only completes the session after email confirmation.
export async function GET(request: Request) {
  const { searchParams, origin } = new URL(request.url)
  const code = searchParams.get('code')
  const next = searchParams.get('next') ?? '/'

  if (code) {
    const supabase = createServerSupabaseClient()
    const { error } = await supabase.auth.exchangeCodeForSession(code)
    if (!error) {
      return NextResponse.redirect(`${origin}${next}`)
    }
  }

  // A failed exchange usually means the link was opened in a different
  // browser than the signup (PKCE verifier lives in the original browser's
  // cookies) — the email itself is typically already confirmed, so send them
  // to sign in and finish there. Preserve `next` so they still land right.
  return NextResponse.redirect(
    `${origin}/auth/signin?error=confirmation_failed&next=${encodeURIComponent(next)}`,
  )
}
