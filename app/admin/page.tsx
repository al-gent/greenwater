import { redirect } from 'next/navigation'
import { getServerUser } from '@/lib/supabase-server'
import { supabaseAdmin } from '@/lib/supabase-admin'
import AdminDashboard from '@/components/AdminDashboard'

export const dynamic = 'force-dynamic'

export default async function AdminPage() {
  const user = await getServerUser()
  if (!user) redirect('/auth/signin?next=/admin')

  const { data: profile } = await supabaseAdmin
    .from('profiles')
    .select('role')
    .eq('id', user.id)
    .single()

  if (profile?.role !== 'admin') redirect('/')

  return <AdminDashboard />
}
