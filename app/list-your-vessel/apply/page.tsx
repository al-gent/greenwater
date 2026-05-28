import { redirect } from 'next/navigation'
import { getServerUser } from '@/lib/supabase-server'
import ApplyForm from './ApplyForm'

export default async function ApplyPage() {
  const user = await getServerUser()
  if (!user) {
    redirect('/auth/signin?next=/list-your-vessel/apply')
  }
  return <ApplyForm userEmail={user.email ?? ''} />
}
