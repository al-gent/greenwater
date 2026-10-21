'use client'

import { useEffect, useState } from 'react'
import Link from 'next/link'
import dynamic from 'next/dynamic'
import { useRouter, useSearchParams } from 'next/navigation'
import UpdateLocationModal from '@/components/UpdateLocationModal'
import AvailabilityButton from '@/components/AvailabilityButton'

const PositionMap = dynamic(() => import('@/components/PositionMap'), {
  ssr: false,
  loading: () => <div className="w-full h-full bg-gray-100" />,
})
import { stripHtml, getPhotoUrl } from '@/lib/vessel-utils'
import type { Vessel } from '@/lib/vessel-utils'
import InquiryThread from '@/components/InquiryThread'
import InboxClient from '@/components/InboxClient'
import PreferencesBox from '@/components/PreferencesBox'
import NotificationPrefsMenu, { USER_PREF_OPTIONS } from '@/components/NotificationPrefsMenu'
import ProfileEditForm from '@/components/ProfileEditForm'
import type { MyProject, MyBid } from '@/lib/projects'
import MyBids from '@/components/MyBids'
import AdminDashboard, { ADMIN_TABS, type AdminTab } from '@/components/AdminDashboard'
import { fmtDate } from '@/lib/cruise-utils'

type UserTab = 'listings' | 'projects' | 'messages' | 'profile'
type Tab = UserTab | `admin:${AdminTab}`

/** The listing fields we ask for in the /list-your-vessel onboarding flow —
 *  the definition of a "complete" listing. Checked against the vessels row. */
const KEY_FIELDS: Array<[col: string, label: string]> = [
  ['photo_urls', 'photos'],
  ['main_activity', 'description'],
  ['operator_name', 'operator'],
  ['country', 'country'],
  ['port_city', 'home port'],
  ['length', 'length'],
  ['beam', 'beam'],
  ['draft', 'draft'],
  ['speed_cruise', 'cruise speed'],
  ['speed_max', 'max speed'],
  ['crew', 'crew size'],
  ['scientists', 'science berths'],
  ['year_built', 'year built'],
  ['operating_area', 'operating area'],
  ['endurance', 'endurance'],
  ['imo_number', 'IMO number'],
  ['mmsi', 'MMSI'],
  ['call_sign', 'call sign'],
  ['url_ship', 'website'],
]

function missingFields(v: Vessel): string[] {
  const row = v as unknown as Record<string, unknown>
  return KEY_FIELDS.filter(([col]) => {
    const val = row[col]
    if (col === 'photo_urls') return !(Array.isArray(val) && val.length > 0)
    if (col === 'main_activity') return !stripHtml((val as string) ?? '').trim()
    if (typeof val === 'number') return val === 0
    return val === null || val === undefined || String(val).trim() === ''
  }).map(([, label]) => label)
}

type Position = {
  label: string
  date: string
  source: 'operator' | 'tracking'
  lat: number | null
  lon: number | null
}

function lastUpdatedLabel(iso: string | null): { text: string; stale: boolean } {
  if (!iso) return { text: 'never updated', stale: true }
  const d = new Date(iso)
  const months = (Date.now() - d.getTime()) / (30 * 86400_000)
  return {
    text: `Updated ${d.toLocaleDateString('en-US', { month: 'short', year: 'numeric' })}`,
    stale: months > 12,
  }
}

interface Message {
  id: string
  thread_id: string
  vessel_id: number
  author_id: string
  status: string
  [key: string]: unknown
}

interface ScientistProfile {
  id: string
  first_name: string | null
  last_name: string | null
  institution: string | null
  title: string | null
}

interface DashboardTabsProps {
  email: string
  profile: {
    first_name: string | null
    last_name: string | null
    institution: string | null
    title: string | null
    verified: boolean
    isAdmin: boolean
  }
  vessels: Vessel[]
  viewStats: Record<number, { total: number; recent: number; prev: number }>
  positions: Record<number, Position>
  roots: Message[]
  replies: Message[]
  sentRoots: (Message & { vessel_name?: string })[]
  sentReplies: Message[]
  scientistProfiles: ScientistProfile[]
  projects: MyProject[]
  bids: MyBid[]
}

export default function DashboardTabs({
  email,
  profile,
  vessels,
  viewStats,
  positions,
  roots,
  replies,
  sentRoots,
  sentReplies,
  scientistProfiles,
  projects,
  bids,
}: DashboardTabsProps) {
  const router = useRouter()
  const searchParams = useSearchParams()
  const [locationModal, setLocationModal] = useState<{ id: number; name: string } | null>(null)
  const [adminCounts, setAdminCounts] = useState<Partial<Record<AdminTab, number>>>({})
  useEffect(() => {
    if (!profile.isAdmin) return
    fetch('/api/admin/pending-count').then((r) => r.ok ? r.json() : null).then((d) => {
      if (d) setAdminCounts({ submissions: d.submissions, claims: d.claims, scientists: d.scientists })
    }).catch(() => {})
  }, [profile.isAdmin])

  // Tab lives in the URL (?tab=) so refresh/back/forward keep it; state
  // follows the URL (same pattern as AdminDashboard).
  // No vessels → no My Listings tab (and ?tab=listings falls through to default)
  const adminTabs: Tab[] = profile.isAdmin ? ADMIN_TABS.map((t) => `admin:${t.key}` as Tab) : []
  const validTabs: Tab[] = [...adminTabs, ...(vessels.length > 0 ? ['listings' as Tab] : []), 'projects', 'messages', 'profile']
  // Admins open on analytics; operators on their listings; researchers on their projects.
  const defaultTab: Tab = profile.isAdmin ? 'admin:analytics' : vessels.length > 0 ? 'listings' : 'projects'
  const urlTab = searchParams.get('tab') as Tab | null
  const tab: Tab = urlTab && validTabs.includes(urlTab) ? urlTab : defaultTab
  const setTab = (t: Tab) =>
    router.push(t === defaultTab ? '/dashboard' : `/dashboard?tab=${t}`, { scroll: false })

  // Legacy deep links (emails, old badge) point at /dashboard#inquiries
  useEffect(() => {
    if (window.location.hash.replace('#', '') === 'inquiries') {
      router.replace('/dashboard?tab=messages', { scroll: false })
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  const newTotal = roots.filter((m) => m.status === 'new').length
  const name = [profile.first_name, profile.last_name].filter(Boolean).join(' ')
  const initials =
    ((profile.first_name?.[0] ?? '') + (profile.last_name?.[0] ?? '')).toUpperCase() ||
    email[0]?.toUpperCase() ||
    '?'

  const attention = projects.reduce((n, p) => n + p.bids_open, 0) + bids.filter((b) => b.accepted_at && !b.confirmed_at && !b.declined_at && !b.withdrawn_at).length
  const NAV: { key: Tab | 'fleet'; label: string; badge?: number; href?: string; group?: string }[] = [
    ...ADMIN_TABS.filter(() => profile.isAdmin).map((t) => ({ key: `admin:${t.key}` as Tab, label: t.label, badge: adminCounts[t.key], group: 'Admin' })),
    ...(vessels.length > 0 ? [{ key: 'listings' as Tab, label: 'My Listings' }] : []),
    { key: 'projects', label: 'Projects', badge: attention },
    { key: 'fleet', label: 'My Fleet', href: '/fleet' },
    { key: 'messages', label: 'Messages', badge: newTotal },
    { key: 'profile', label: 'Profile' },
  ]
  const navItem = (t: Tab) =>
    `w-full flex items-center justify-between gap-2 px-3.5 py-2 rounded-xl text-sm font-medium transition-colors text-left ${
      tab === t ? 'bg-navy text-white' : 'text-gray-600 hover:text-navy hover:bg-gray-100'
    }`

  return (
    <div className="lg:grid lg:grid-cols-[200px_1fr] lg:gap-10 lg:items-start">
      {/* Section nav: a sidebar on wide screens, a row of pills on small ones */}
      <nav className="flex lg:flex-col gap-1.5 mb-8 lg:mb-0 flex-wrap lg:sticky lg:top-[104px]" aria-label="Dashboard">
        {profile.isAdmin && <p className="hidden lg:block px-3.5 pb-1 text-[11px] font-semibold text-gray-400">Admin</p>}
        {NAV.map((n, i) => n.href ? (
          <Link key={n.key} href={n.href} className={navItem(n.key as Tab)}><span>{n.label}</span></Link>
        ) : (
          <button key={n.key} onClick={() => setTab(n.key as Tab)} className={`${navItem(n.key as Tab)} ${!n.group && i > 0 && NAV[i - 1].group ? 'lg:mt-3 lg:border-t lg:border-gray-200 lg:pt-3 lg:rounded-t-none' : ''}`} aria-current={tab === n.key ? 'page' : undefined}>
            <span>{n.label}</span>
            {n.badge ? <span className={`text-xs font-bold px-1.5 py-0.5 rounded-full leading-none bg-gold text-navy`}>{n.badge}</span> : null}
          </button>
        ))}
      </nav>

      <div className="min-w-0">
      {/* ── Admin sections ── (one component, the sidebar picks the section) */}
      {tab.startsWith('admin:') && (
        <AdminDashboard embedded tab={tab.slice(6) as AdminTab} onTabChange={(t) => setTab(`admin:${t}`)} />
      )}

      {/* ── Listings ── (tab only exists when the user operates vessels) */}
      {tab === 'listings' && (
          vessels.map((v) => {
            const views = viewStats[v.id] ?? { total: 0, recent: 0, prev: 0 }
            const vesselRoots = roots.filter((m) => m.vessel_id === v.id)
            const awaiting = vesselRoots.filter((m) => m.status !== 'responded').length
            const missing = missingFields(v)
            const updated = lastUpdatedLabel(v.last_updated)
            const trend = views.recent === views.prev ? null : views.recent > views.prev ? 'up' : 'down'
            const position = positions[v.id]
            return (
              <div key={v.id} className="bg-white rounded-2xl shadow-card overflow-hidden mb-4">
                {/* 25 / 50 / 25 — photo · info · location map */}
                <div className="grid grid-cols-1 sm:grid-cols-4">
                  <div className="relative min-h-[100px] sm:min-h-[170px]">
                    <img
                      src={getPhotoUrl(v)}
                      alt={v.name}
                      loading="lazy"
                      className="w-full h-full object-cover absolute inset-0"
                    />
                  </div>

                  <div className="sm:col-span-2 p-4 sm:p-5 flex flex-col">
                    <div className="flex items-center gap-2 flex-wrap">
                      <Link
                        href={`/vessels/${v.id}`}
                        target="_blank"
                        className="text-lg font-bold text-navy hover:text-teal transition-colors"
                      >
                        {v.name}
                      </Link>
                      <span className={`text-[10px] font-semibold uppercase tracking-wide rounded-full px-2 py-0.5 border ${
                        v.status === 'active'
                          ? 'bg-teal-50 text-teal border-teal/20'
                          : 'bg-gray-100 text-gray-500 border-gray-200'
                      }`}>
                        {v.status}
                      </span>
                    </div>
                    <div className="flex flex-col gap-1 text-sm text-gray-500 mt-3">
                      {vesselRoots.length > 0 ? (
                        <button
                          onClick={() => setTab('messages')}
                          className={`text-left font-medium hover:underline ${awaiting > 0 ? 'text-navy' : 'text-gray-500'}`}
                        >
                          {awaiting > 0
                            ? `${awaiting} awaiting your reply →`
                            : `${vesselRoots.length} conversation${vesselRoots.length > 1 ? 's' : ''} · caught up`}
                        </button>
                      ) : (
                        <span className="text-gray-400">No inquiries yet</span>
                      )}
                      <span>
                        <span className="font-semibold text-navy">{views.recent}</span> views last 30 days
                        {trend && (
                          <span className={trend === 'up' ? 'text-teal' : 'text-gray-400'}>
                            {' '}{trend === 'up' ? '↑' : '↓'} {views.prev}
                          </span>
                        )}
                        {' · '}
                        <span className="font-semibold text-navy">{views.total}</span> all-time
                      </span>
                      <span className={updated.stale ? 'text-amber-600 text-xs' : 'text-gray-400 text-xs'}>{updated.text}</span>
                    </div>

                    <div className="flex items-center gap-2 mt-auto pt-3">
                      <Link
                        href={`/dashboard/edit?vessel=${v.id}`}
                        className="bg-navy text-white px-4 py-1.5 rounded-full text-xs font-medium hover:bg-navy-600 transition-colors"
                      >
                        Edit
                      </Link>
                      <AvailabilityButton vesselId={v.id} vesselName={v.name} className="border border-navy/20 text-navy px-4 py-1.5 rounded-full text-xs font-medium hover:bg-navy-50 transition-colors">Availability</AvailabilityButton>
                      {missing.length > 0 && (
                        <span className="text-xs text-amber-600 font-medium" title={`Missing: ${missing.join(', ')}`}>
                          {missing.length} field{missing.length > 1 ? 's' : ''} missing
                        </span>
                      )}
                    </div>
                  </div>

                  <button
                    onClick={() => setLocationModal({ id: v.id, name: v.name })}
                    title="Update location"
                    className="relative isolate z-0 min-h-[170px] w-full border-t sm:border-t-0 sm:border-l border-gray-100 text-left cursor-pointer group"
                  >
                    <div className="absolute inset-0">
                      <PositionMap lat={position?.lat ?? null} lon={position?.lon ?? null} />
                    </div>
                    <div className="absolute inset-x-0 bottom-0 z-[1000] bg-gradient-to-t from-white/95 via-white/80 to-transparent px-3 pt-5 pb-2.5">
                      <p className="text-[11px] text-gray-600 truncate">
                        {position ? (
                          <>
                            <span className="font-semibold text-navy">{position.label}</span>
                            {' · '}{position.source === 'operator' ? 'operator reported' : 'ship tracking'}
                            {' · '}{new Date(position.date).toLocaleDateString('en-US', { month: 'short', day: 'numeric' })}
                          </>
                        ) : (
                          'No location on file'
                        )}
                      </p>
                    </div>
                  </button>
                </div>
              </div>
            )
          })
      )}

      {locationModal && (
        <UpdateLocationModal
          vesselId={locationModal.id}
          vesselName={locationModal.name}
          current={(() => {
            const p = positions[locationModal.id]
            return p ? { label: p.label, lat: p.lat, lon: p.lon } : undefined
          })()}
          onClose={() => setLocationModal(null)}
        />
      )}

      {/* ── Messages ── */}
      {/* ── Projects ── research the user wants to get done; bids arrive here */}
      {tab === 'projects' && (
        <div>
          {/* Operators lead with the bids they've made; researchers with their projects. */}
          {vessels.length > 0 && <MyBids bids={bids} />}
          {(projects.length > 0 || vessels.length === 0) && (
            <div className={vessels.length > 0 ? 'mt-10' : ''}>
              <div className="flex items-center justify-between mb-3">
                {projects.length === 0
                  ? <p className="text-sm text-gray-500">Describe the research you want to do and operators can bid to run it.</p>
                  : <h3 className="text-sm font-semibold text-navy">Your projects</h3>}
                <Link href="/projects/new" className="bg-navy text-white px-4 py-2 rounded-xl text-sm font-semibold hover:bg-navy-600 transition-colors">Post a project</Link>
              </div>
              {projects.length > 0 && (
                <ul className="bg-white rounded-2xl shadow-card divide-y divide-gray-100 overflow-hidden">
                  {projects.map((p) => {
                    const status = p.cruise_id ? 'Scheduled' : p.published_at ? 'Open for bids' : 'Draft'
                    const cls = p.cruise_id ? 'bg-teal/10 text-teal border-teal/30' : p.published_at ? 'bg-navy-50 text-navy border-navy/10' : 'bg-gray-100 text-gray-500 border-gray-200'
                    const when = [fmtDate(p.requested_start_earliest), fmtDate(p.requested_start_latest)].filter(Boolean).join(' – ')
                    // One line: the single thing waiting on someone.
                    const next = p.cruise_id ? null
                      : p.bids_open > 0 ? { text: `${p.bids_open} bid${p.bids_open === 1 ? '' : 's'} to review`, cls: 'text-gold-700 font-semibold' }
                      : p.bids_accepted > 0 ? { text: 'Waiting on the operator to confirm', cls: 'text-teal font-medium' }
                      : p.published_at ? { text: 'No bids yet', cls: 'text-gray-400' }
                      : { text: 'Not published', cls: 'text-gray-400' }
                    return (
                      <li key={p.id}>
                        <Link href={`/projects/${p.slug}`} className="flex items-center gap-4 px-5 py-4 hover:bg-gray-50 transition-colors group">
                          <div className="min-w-0 flex-1">
                            <p className="text-sm font-semibold text-navy truncate group-hover:text-teal transition-colors">{p.title}</p>
                            <p className="text-xs text-gray-500 mt-0.5 truncate">{[p.area_label, when, p.requested_science_days != null ? `${p.requested_science_days} science days` : null].filter(Boolean).join(' · ') || 'No dates or area yet'}</p>
                          </div>
                          {next && <p className={`text-xs flex-shrink-0 ${next.cls}`}>{next.text}</p>}
                          <span className={`text-[11px] font-semibold px-2 py-0.5 rounded-full border flex-shrink-0 ${cls}`}>{status}</span>
                        </Link>
                      </li>
                    )
                  })}
                </ul>
              )}
            </div>
          )}
          {vessels.length === 0 && <MyBids bids={bids} />}
        </div>
      )}

      {tab === 'messages' && (
        <div>
          {vessels.map((v) => {
            const vesselRoots = roots.filter((m) => m.vessel_id === v.id)
            const vesselReplies = replies.filter((m) => m.vessel_id === v.id)
            const newCount = vesselRoots.filter((m) => m.status === 'new').length
            return (
              <div key={v.id} className="mb-10">
                <h2 className="text-lg font-semibold text-navy mb-4">
                  {vessels.length > 1 ? `Inquiries — ${v.name}` : 'Inquiries'}
                  {newCount > 0 && (
                    <span className="ml-2 bg-gold text-navy text-xs font-bold px-2 py-0.5 rounded-full">
                      {newCount} new
                    </span>
                  )}
                </h2>
                <InquiryThread
                  roots={vesselRoots as never}
                  replies={vesselReplies as never}
                  profiles={scientistProfiles}
                />
              </div>
            )
          })}
          {/* Conversations the user started, inline — same tab, no separate inbox */}
          {(sentRoots.length > 0 || vessels.length === 0) && (
            <div>
              {vessels.length > 0 && sentRoots.length > 0 && (
                <h2 className="text-lg font-semibold text-navy mb-4">Your inquiries</h2>
              )}
              <InboxClient roots={sentRoots as never} replies={sentReplies as never} />
            </div>
          )}
        </div>
      )}

      {/* ── Profile ── */}
      {tab === 'profile' && (
        <div className="bg-white rounded-2xl shadow-card p-6 sm:p-8 max-w-xl">
          <div className="flex items-center justify-between mb-6">
            <div className="flex items-center gap-4">
              <div className="w-12 h-12 rounded-full bg-navy text-white flex items-center justify-center text-base font-semibold tracking-wide">
                {initials}
              </div>
              <div>
                <p className="font-bold text-navy">{name || email}</p>
                <p className="text-sm text-gray-500">{email}</p>
              </div>
            </div>
            <div className="flex items-center gap-1.5">
              {profile.isAdmin && (
                <span className="text-xs font-semibold bg-navy text-white rounded-full px-2.5 py-1">Admin</span>
              )}
              {profile.verified && (
                <span className="text-xs font-semibold bg-teal-50 text-teal border border-teal/20 rounded-full px-2.5 py-1">
                  Verified
                </span>
              )}
            </div>
          </div>

          <ProfileEditForm />

          <div className="flex items-center justify-between border-t border-gray-100 mt-6 pt-5">
            <span className="text-sm text-gray-600">Email notifications</span>
            {/* Admins manage all four notification types; everyone else has the messages toggle */}
            <NotificationPrefsMenu options={profile.isAdmin ? undefined : USER_PREF_OPTIONS} />
          </div>
          <PreferencesBox />
        </div>
      )}
      </div>
    </div>
  )
}
