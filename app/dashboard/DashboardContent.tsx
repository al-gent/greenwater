import { getDashboardTab, type DashboardPage, type DashboardSection } from '@/lib/dashboard-navigation'
import { redirect } from 'next/navigation'
import { getServerUser } from '@/lib/supabase-server'
import { supabaseAdmin } from '@/lib/supabase-admin'
import { getOperatedVesselIds } from '@/lib/operators'
import type { Vessel } from '@/lib/vessel-utils'
import DashboardTabs, { type DashboardMessage } from '@/components/DashboardTabs'
import FleetPanel from './fleet/FleetPanel'
import { listMyProjectsWithBids, listMyBids } from '@/lib/projects'

// Account home for every signed-in user: listings (operators), messages,
// profile + notification prefs, sign out. Operator-ness comes from
// vessel_operators membership — one user can run several vessels, and
// admins can be operators too.
export default async function DashboardContent({ section, tab, scale, at, children, currentPage }: {
  children?: React.ReactNode
  currentPage?: DashboardPage
  section?: DashboardSection; tab?: string; scale?: string; at?: string
}) {
  const user = await getServerUser()
  if (!user) {
    const next = currentPage?.href ?? (section ? `/dashboard/${section}` : '/dashboard')
    redirect(`/auth/signin?next=${encodeURIComponent(next)}`)
  }

  const [vesselIds, { data: profile }] = await Promise.all([
    getOperatedVesselIds(user.id),
    supabaseAdmin
      .from('profiles')
      .select('first_name, last_name, institution, title, verified, is_admin')
      .eq('id', user.id)
      .single(),
  ])

  const operator = user.user_metadata?.account_type === 'vessel' || vesselIds.length > 0
  if (!section && !tab && !profile?.is_admin && operator) redirect('/dashboard/listings')

  const active = section ?? getDashboardTab(tab, !!profile?.is_admin, operator)
  const listings = active === 'listings' && !currentPage
  const messages = active === 'messages'
  const projects = active === 'projects' && !currentPage
  const showSuggestions = !currentPage && (section === 'listings' || (!section && !tab && !profile?.is_admin))
  const [vesselRows, received, sent, viewStats, positions, myProjects, myBids, badge] = await Promise.all([
    vesselIds.length && (listings || messages)
      ? supabaseAdmin.from('vessels').select(listings ? '*' : 'id,name').in('id', vesselIds).order('name')
      : { data: [] },
    receivedMessages(user.id, vesselIds, messages),
    messages ? sentMessages(user.id) : { sentRoots: [], sentReplies: [] },
    listings ? listingViews(vesselIds) : {},
    listings ? listingPositions(vesselIds) : {},
    projects ? listMyProjectsWithBids(user.id) : [],
    projects ? listMyBids(vesselIds) : [],
    projects ? 0 : projectBadge(user.id, vesselIds),
  ])
  const projectAttention = projects ? myProjects.reduce((n, p) => n + p.bids_open, 0)
    + myBids.filter(b => b.accepted_at && !b.confirmed_at && !b.declined_at && !b.withdrawn_at).length : badge

  return (
    <div className="pt-16 min-h-screen bg-gray-50">
      <div className="page-gutter w-full py-8">
        <DashboardTabs
          section={section}
          currentPage={currentPage}
          email={user.email ?? ''}
          profile={{
            first_name: profile?.first_name ?? null,
            last_name: profile?.last_name ?? null,
            institution: profile?.institution ?? null,
            title: profile?.title ?? null,
            verified: !!profile?.verified,
            isAdmin: profile?.is_admin === true,
            signedUpAsOperator: user.user_metadata?.account_type === 'vessel',
          }}
          showSuggestions={showSuggestions && !!user.email_confirmed_at && !!user.email}
          hasVessels={vesselIds.length > 0}
          projectAttention={projectAttention}
          vessels={(vesselRows.data ?? []) as unknown as Vessel[]}
          viewStats={viewStats}
          positions={positions}
          {...received}
          {...sent}
          projects={myProjects}
          bids={myBids}
        >
          {section === 'fleet' ? <FleetPanel userId={user.id} scale={scale} at={at} /> : children}
        </DashboardTabs>
      </div>
    </div>
  )
}

async function receivedMessages(userId: string, vesselIds: number[], detail: boolean) {
  if (!vesselIds.length) return { roots: [], replies: [], scientistProfiles: [] }
  const { data } = await supabaseAdmin.from('messages')
    .select(detail ? '*' : 'id,thread_id,author_id,vessel_id,status')
    .in('vessel_id', vesselIds).order('created_at', { ascending: true }).limit(400)
  const rows = (data ?? []) as unknown as DashboardMessage[]
  const roots = rows.filter(m => m.id === m.thread_id && m.author_id !== userId).reverse()
  const replies = detail ? rows.filter(m => m.id !== m.thread_id) : []
  const authorIds = [...new Set(roots.map((r) => r.author_id))]
  const { data: scientistProfiles } = detail && authorIds.length
    ? await supabaseAdmin
        .from('profiles')
        .select('id, first_name, last_name, institution, title')
        .in('id', authorIds)
    : { data: [] }

  return { roots, replies, scientistProfiles: scientistProfiles ?? [] }
}

async function sentMessages(userId: string) {
  // Inquirer side: threads the user started, on any vessel.
  const { data: sentAll } = await supabaseAdmin
    .from('messages')
    .select('*')
    .eq('author_id', userId)
    .order('created_at', { ascending: true })
    .limit(200)
  const sentRootsRaw = (sentAll ?? []).filter((m) => m.thread_id === m.id)
  sentRootsRaw.sort((a, b) => new Date(b.created_at).getTime() - new Date(a.created_at).getTime())
  const sentThreadIds = sentRootsRaw.map((r) => r.id)
  const sentVesselIds = [...new Set(sentRootsRaw.map((r) => r.vessel_id as number))]
  const [{ data: sentThreadMsgs }, { data: sentVessels }] = await Promise.all([
    sentThreadIds.length
    ? supabaseAdmin
        .from('messages')
        .select('*')
        .in('thread_id', sentThreadIds)
        .order('created_at', { ascending: true })
    : { data: [] },
    sentVesselIds.length
    ? supabaseAdmin.from('vessels').select('id, name').in('id', sentVesselIds)
    : { data: [] },
  ])
  const sentReplies = (sentThreadMsgs ?? []).filter((m) => m.thread_id !== m.id)
  const sentVesselNames = Object.fromEntries((sentVessels ?? []).map((v) => [v.id, v.name]))
  const sentRoots = sentRootsRaw.map((r) => ({
    ...r,
    vessel_name: sentVesselNames[r.vessel_id] ?? `Vessel #${r.vessel_id}`,
  }))

  return { sentRoots, sentReplies }
}

async function listingViews(vesselIds: number[]) {
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

  return viewStats
}

async function listingPositions(vesselIds: number[]) {
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

  return positions
}

async function projectBadge(userId: string, vesselIds: number[]) {
  const [incoming, outgoing] = await Promise.all([
    supabaseAdmin.from('project_bids').select('id,project:projects!inner(created_by,deleted_at)', { count: 'exact', head: true })
      .eq('project.created_by', userId).is('project.deleted_at', null).is('accepted_at', null)
      .is('confirmed_at', null).is('declined_at', null).is('withdrawn_at', null),
    vesselIds.length ? supabaseAdmin.from('project_bids').select('id', { count: 'exact', head: true })
      .in('vessel_id', vesselIds).not('accepted_at', 'is', null)
      .is('confirmed_at', null).is('declined_at', null).is('withdrawn_at', null) : { count: 0 },
  ])
  return (incoming.count ?? 0) + (outgoing.count ?? 0)
}
