'use client'

import { useEffect, useState } from 'react'
import Link from 'next/link'
import dynamic from 'next/dynamic'
import { useRouter, useSearchParams } from 'next/navigation'
import UpdateLocationModal from '@/components/UpdateLocationModal'

const PositionMap = dynamic(() => import('@/components/PositionMap'), {
  ssr: false,
  loading: () => <div className="w-full h-full bg-gray-100" />,
})
import { stripHtml, getPhotoUrl } from '@/lib/vessel-utils'
import type { Vessel } from '@/lib/vessel-utils'
import InquiryThread from '@/components/InquiryThread'
import InboxClient from '@/components/InboxClient'
import NotificationPrefsMenu, { USER_PREF_OPTIONS } from '@/components/NotificationPrefsMenu'
import ProfileEditForm from '@/components/ProfileEditForm'

type Tab = 'listings' | 'messages' | 'profile'

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
}: DashboardTabsProps) {
  const router = useRouter()
  const searchParams = useSearchParams()
  const [locationModal, setLocationModal] = useState<{ id: number; name: string } | null>(null)

  // Tab lives in the URL (?tab=) so refresh/back/forward keep it; state
  // follows the URL (same pattern as AdminDashboard).
  // No vessels → no My Listings tab (and ?tab=listings falls through to default)
  const validTabs: Tab[] = vessels.length > 0 ? ['listings', 'messages', 'profile'] : ['messages', 'profile']
  const defaultTab: Tab = vessels.length > 0 ? 'listings' : 'profile'
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

  const tabClass = (t: Tab) =>
    `px-4 py-2.5 text-sm font-medium rounded-full transition-colors ${
      tab === t ? 'bg-navy text-white' : 'text-gray-600 hover:text-navy hover:bg-gray-100'
    }`

  return (
    <div>
      {/* Tab bar */}
      <div className="flex items-center gap-1.5 mb-8 flex-wrap">
        {vessels.length > 0 && (
          <button onClick={() => setTab('listings')} className={tabClass('listings')}>
            My Listings
          </button>
        )}
        <button onClick={() => setTab('messages')} className={`${tabClass('messages')} flex items-center gap-1.5`}>
          Messages
          {newTotal > 0 && (
            <span className="bg-gold text-navy text-xs font-bold px-1.5 py-0.5 rounded-full leading-none">
              {newTotal}
            </span>
          )}
        </button>
        <button onClick={() => setTab('profile')} className={tabClass('profile')}>
          Profile
        </button>
      </div>

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
        </div>
      )}
    </div>
  )
}
