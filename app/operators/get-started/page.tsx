import { authLink } from '@/lib/auth-navigation'
import { redirect } from 'next/navigation'
import { getServerUser } from '@/lib/supabase-server'

export default async function OperatorGetStartedPage() {
  const user = await getServerUser()
  redirect(user ? '/dashboard/listings' : authLink('/get-started', '/dashboard/listings'))
}
