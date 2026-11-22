'use client'

import { useEffect } from 'react'
import { useRouter } from 'next/navigation'
import { createClient } from '@/lib/supabase-browser'

import { authDestination } from '@/lib/auth-navigation'

export default function AuthHashHandler() {
  const router = useRouter()

  useEffect(() => {
    const params = new URLSearchParams(window.location.search)
    const code = params.get('code')

    // PKCE code landed on root instead of /auth/callback — forward it
    if (code) {
      const callback = new URLSearchParams({ code })
      if (params.has('next')) callback.set('next', authDestination(params.get('next')))
      router.replace(`/auth/callback?${callback}`)
      return
    }

    // Implicit flow: access_token in hash
    // Skip on reset-password — that page manages its own session setup
    if (window.location.pathname === '/auth/reset-password') return
    if (!window.location.hash.includes('access_token')) return

    const supabase = createClient()
    const { data: { subscription } } = supabase.auth.onAuthStateChange((event, session) => {
      if (event === 'SIGNED_IN' && session) {
        subscription.unsubscribe()
        router.replace(authDestination(params.get('next') ?? session.user.user_metadata.signup_next))
      }
    })

    return () => subscription.unsubscribe()
  }, [router])

  return null
}
