'use client'

import { useEffect } from 'react'
import { useRouter } from 'next/navigation'
import { createClient } from '@/lib/supabase-browser'

export default function AuthHashHandler() {
  const router = useRouter()

  useEffect(() => {
    const params = new URLSearchParams(window.location.search)
    const code = params.get('code')

    // PKCE code landed on root instead of /auth/callback — forward it
    if (code) {
      router.replace(`/auth/callback?code=${code}`)
      return
    }

    // Implicit flow: access_token in hash
    if (!window.location.hash.includes('access_token')) return

    const hashParams = new URLSearchParams(window.location.hash.slice(1))
    const type = hashParams.get('type')

    // Recovery link — redirect to password reset page
    if (type === 'recovery') {
      const supabase = createClient()
      const { data: { subscription } } = supabase.auth.onAuthStateChange((event) => {
        if (event === 'PASSWORD_RECOVERY') {
          subscription.unsubscribe()
          router.replace('/auth/reset-password')
        }
      })
      return () => subscription.unsubscribe()
    }

    const supabase = createClient()
    const { data: { subscription } } = supabase.auth.onAuthStateChange((event, session) => {
      if (event === 'SIGNED_IN' && session) {
        subscription.unsubscribe()
        router.replace('/dashboard')
      }
    })

    return () => subscription.unsubscribe()
  }, [router])

  return null
}
