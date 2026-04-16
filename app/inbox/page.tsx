import { redirect } from 'next/navigation'
import { getServerUser } from '@/lib/supabase-server'
import { supabaseAdmin } from '@/lib/supabase-admin'
import InboxClient from '@/components/InboxClient'

export const dynamic = 'force-dynamic'

export default async function InboxPage() {
  const user = await getServerUser()
  if (!user) redirect('/auth/signin?next=/inbox')

  const { data: allMessages } = await supabaseAdmin
    .from('messages')
    .select('*')
    .eq('author_id', user.id)
    .order('created_at', { ascending: true })
    .limit(200)

  const myRoots = (allMessages ?? []).filter((m: { id: string; thread_id: string }) => m.thread_id === m.id)
  myRoots.sort(
    (a: { created_at: string }, b: { created_at: string }) =>
      new Date(b.created_at).getTime() - new Date(a.created_at).getTime(),
  )

  const threadIds = myRoots.map((r: { id: string }) => r.id)
  const { data: allReplies } = threadIds.length
    ? await supabaseAdmin
        .from('messages')
        .select('*')
        .in('thread_id', threadIds)
        .order('created_at', { ascending: true })
    : { data: [] }

  const replies = (allReplies ?? []).filter((m: { id: string; thread_id: string }) => m.thread_id !== m.id)

  // Fetch vessel names separately
  const vesselIds = [...new Set(myRoots.map((r: { vessel_id: number }) => r.vessel_id))]
  const { data: vessels } = vesselIds.length
    ? await supabaseAdmin.from('vessels').select('id, name').in('id', vesselIds)
    : { data: [] }
  const vesselMap = Object.fromEntries((vessels ?? []).map((v: { id: number; name: string }) => [v.id, v.name]))

  const rootsWithVesselName = myRoots.map((r) => ({
    ...r,
    vessel_name: vesselMap[r.vessel_id] ?? `Vessel #${r.vessel_id}`,
  }))

  return (
    <div className="pt-[88px] min-h-screen bg-gray-50">
      <div className="max-w-3xl mx-auto px-4 sm:px-6 lg:px-8 py-8">
        <div className="mb-6">
          <h1 className="text-2xl font-bold text-navy">Inbox</h1>
          <p className="text-sm text-gray-500 mt-0.5">Your messages with vessel operators</p>
        </div>

        <InboxClient roots={rootsWithVesselName} replies={replies} />
      </div>
    </div>
  )
}
