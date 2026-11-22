import { redirect } from 'next/navigation'
import { getServerUser } from '@/lib/supabase-server'
import DashboardContent from '../../DashboardContent'
import { listVessel } from '@/lib/dashboard-navigation'
import ApplyForm from './ApplyForm'

export default async function ApplyPage() {
  const user = await getServerUser()
  if (!user) {
    redirect('/auth/signin?next=/dashboard/listings/new')
  }
  return (
    <DashboardContent section="listings" currentPage={listVessel}>
      <ApplyForm userEmail={user.email ?? ''} />
    </DashboardContent>
  )
}
