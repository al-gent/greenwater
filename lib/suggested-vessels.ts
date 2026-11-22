import 'server-only'
import type { User } from '@supabase/supabase-js'
import { supabaseAdmin } from './supabase-admin'

export async function getSuggestedVessels(user: Pick<User, 'id' | 'email' | 'email_confirmed_at'>) {
  const email = user.email?.trim().toLowerCase()
  if (!user.email_confirmed_at || !email) return []

  const { data, error } = await supabaseAdmin.rpc('suggested_vessel_claims', { p_user: user.id, p_email: email })
  if (error) {
    // Suggestions are optional. A lookup failure must not block the dashboard or manual claims.
    console.error('Could not load suggested vessel claims', error.message)
    return []
  }
  return (data ?? []) as { id: number; name: string }[]
}
