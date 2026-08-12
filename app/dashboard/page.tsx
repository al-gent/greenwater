import { redirect } from 'next/navigation'
import { getServerUser } from '@/lib/supabase-server'
import { supabaseAdmin } from '@/lib/supabase-admin'
import { getOperatedVesselIds } from '@/lib/operators'
import type { Vessel } from '@/lib/vessel-utils'
import DashboardTabs from '@/components/DashboardTabs'

export const dynamic = 'force-dynamic'

// Account home for every signed-in user: listings (operators), messages,
// profile + notification prefs, sign out. Operator-ness comes from
// vessel_operators membership — one user can run several vessels, and
// admins can be operators too.
export default async function DashboardPage() {
  const user = await getServerUser()
  if (!user) redirect('/auth/signin?next=/dashboard')

  const [vesselIds, { data: profile }] = await Promise.all([
    getOperatedVesselIds(user.id),
    supabaseAdmin
      .from('profiles')
      .select('first_name, last_name, institution, title, verified, is_admin')
      .eq('id', user.id)
      .single(),
  ])

  const [{ data: vessels }, { data: allMessages }] = await Promise.all([
    vesselIds.length
      ? supabaseAdmin.from('vessels').select('*').in('id', vesselIds).order('name')
      : Promise.resolve({ data: [] as Vessel[] }),
    vesselIds.length
      ? supabaseAdmin
          .from('messages')
          .select('*')
          .in('vessel_id', vesselIds)
          .order('created_at', { ascending: true })
          .limit(400)
      : Promise.resolve({ data: [] }),
  ])

  // Operator side: inquiries on operated vessels, excluding threads the user
  // authored (those render on the inquirer side below — author precedence).
  const roots = (allMessages ?? []).filter((m) => m.thread_id === m.id && m.author_id !== user.id)
  const replies = (allMessages ?? []).filter((m) => m.thread_id !== m.id)
  roots.sort((a, b) => new Date(b.created_at).getTime() - new Date(a.created_at).getTime())

  // Inquirer side: threads the user started, on any vessel.
  const { data: sentAll } = await supabaseAdmin
    .from('messages')
    .select('*')
    .eq('author_id', user.id)
    .order('created_at', { ascending: true })
    .limit(200)
  const sentRootsRaw = (sentAll ?? []).filter((m) => m.thread_id === m.id)
  sentRootsRaw.sort((a, b) => new Date(b.created_at).getTime() - new Date(a.created_at).getTime())
  const sentThreadIds = sentRootsRaw.map((r) => r.id)
  const { data: sentThreadMsgs } = sentThreadIds.length
    ? await supabaseAdmin
        .from('messages')
        .select('*')
        .in('thread_id', sentThreadIds)
        .order('created_at', { ascending: true })
    : { data: [] }
  const sentReplies = (sentThreadMsgs ?? []).filter((m) => m.thread_id !== m.id)
  const sentVesselIds = [...new Set(sentRootsRaw.map((r) => r.vessel_id as number))]
  const { data: sentVessels } = sentVesselIds.length
    ? await supabaseAdmin.from('vessels').select('id, name').in('id', sentVesselIds)
    : { data: [] }
  const sentVesselNames = Object.fromEntries((sentVessels ?? []).map((v) => [v.id, v.name]))
  const sentRoots = sentRootsRaw.map((r) => ({
    ...r,
    vessel_name: sentVesselNames[r.vessel_id] ?? `Vessel #${r.vessel_id}`,
  }))

  const authorIds = [...new Set(roots.map((r) => r.author_id))]
  const { data: scientistProfiles } = authorIds.length
    ? await supabaseAdmin
        .from('profiles')
        .select('id, first_name, last_name, institution, title')
        .in('id', authorIds)
    : { data: [] }

  // Listing views per vessel — filtered head-counts, no rows fetched.
  // `prev` is the 30-60-days-ago window, for the trend direction.
  const monthAgo = new Date(Date.now() - 30 * 86400_000).toISOString()
  const twoMonthsAgo = new Date(Date.now() - 60 * 86400_000).toISOString()
  const viewStats: Record<number, { total: number; recent: number; prev: number }> = {}
  await Promise.all(
    vesselIds.map(async (id) => {
      const base = () =>
        supabaseAdmin
          .from('page_views')
          .select('*', { count: 'exact', head: true })
          .eq('site', 'app')
          .eq('path', `/vessels/${id}`)
      const [total, recent, prev] = await Promise.all([
        base(),
        base().gt('created_at', monthAgo),
        base().gt('created_at', twoMonthsAgo).lte('created_at', monthAgo),
      ])
      viewStats[id] = { total: total.count ?? 0, recent: recent.count ?? 0, prev: prev.count ?? 0 }
    }),
  )

  // Last known location per vessel: freshest of GFW's last-port record and
  // the newest operator report. The two sources never overwrite each other.
  const positions: Record<
    number,
    { label: string; date: string; source: 'operator' | 'tracking'; lat: number | null; lon: number | null }
  > = {}
  if (vesselIds.length) {
    const [{ data: ports }, { data: reports }] = await Promise.all([
      supabaseAdmin
        .from('vessel_last_port')
        .select('vessel_id, port_city, port_state, port_name, lat, lon, arrived_at')
        .in('vessel_id', vesselIds),
      supabaseAdmin
        .from('vessel_position_reports')
        .select('vessel_id, port_text, lat, lon, reported_at')
        .in('vessel_id', vesselIds)
        .order('reported_at', { ascending: false }),
    ])
    for (const p of ports ?? []) {
      const label = p.port_city
        ? `${p.port_city}${p.port_state ? `, ${p.port_state}` : ''}`
        : (p.port_name as string | null)
      if (label && p.arrived_at) {
        positions[p.vessel_id] = {
          label,
          date: p.arrived_at,
          source: 'tracking',
          lat: p.lat != null ? Number(p.lat) : null,
          lon: p.lon != null ? Number(p.lon) : null,
        }
      }
    }
    const seenReports = new Set<number>()
    for (const r of reports ?? []) {
      // rows arrive newest-first; only the newest report per vessel competes
      if (seenReports.has(r.vessel_id)) continue
      seenReports.add(r.vessel_id)
      const existing = positions[r.vessel_id]
      if (!existing || new Date(r.reported_at) > new Date(existing.date)) {
        positions[r.vessel_id] = {
          label: r.port_text,
          date: r.reported_at,
          source: 'operator',
          lat: r.lat != null ? Number(r.lat) : null,
          lon: r.lon != null ? Number(r.lon) : null,
        }
      }
    }
  }

  return (
    <div className="pt-[88px] min-h-screen bg-gray-50">
      <div className="max-w-5xl mx-auto px-4 sm:px-6 lg:px-8 py-8">
        <DashboardTabs
          email={user.email ?? ''}
          profile={{
            first_name: profile?.first_name ?? null,
            last_name: profile?.last_name ?? null,
            institution: profile?.institution ?? null,
            title: profile?.title ?? null,
            verified: !!profile?.verified,
            isAdmin: profile?.is_admin === true,
          }}
          vessels={(vessels ?? []) as Vessel[]}
          viewStats={viewStats}
          positions={positions}
          roots={roots}
          replies={replies}
          sentRoots={sentRoots}
          sentReplies={sentReplies}
          scientistProfiles={scientistProfiles ?? []}
        />
      </div>
    </div>
  )
}
