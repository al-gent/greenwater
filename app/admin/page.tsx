import { redirect } from 'next/navigation'
import { getServerUser } from '@/lib/supabase-server'
import { supabaseAdmin } from '@/lib/supabase-admin'

export const dynamic = 'force-dynamic'

export default async function AdminPage({ searchParams }: { searchParams: { tab?: string } }) {
  const user = await getServerUser()
  if (!user) redirect('/auth/signin?next=/admin')

  const { data: profile } = await supabaseAdmin
    .from('profiles')
    .select('is_admin')
    .eq('id', user.id)
    .single()

  if (profile?.is_admin !== true) redirect('/')

  // Admin lives inside the dashboard now; old links carry their tab across.
  redirect(`/dashboard?tab=admin:${searchParams.tab ?? 'analytics'}`)
}
