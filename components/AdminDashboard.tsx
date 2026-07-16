'use client'

import { useEffect, useMemo, useState } from 'react'
import { useRouter, useSearchParams } from 'next/navigation'
import AnalyticsTab from './AnalyticsTab'
import NotificationPrefsMenu from './NotificationPrefsMenu'
import { fmtDailyRate } from '@/lib/vessel-utils'

type SubmissionStatus = 'pending' | 'approved' | 'rejected'
type ClaimStatus = 'pending' | 'approved' | 'rejected'

interface Submission {
  id: string
  vessel_name: string
  operator_name: string
  email: string
  port_city: string
  port_state: string | null
  country: string | null
  mmsi: string | null
  imo_number: string | null
  call_sign: string | null
  year_built: number | null
  year_refit: number | null
  length_m: number | null
  beam_m: number | null
  draft_m: number | null
  speed_cruise: number | null
  speed_max: number | null
  scientists: number | null
  crew: number | null
  endurance: string | null
  main_activity: string | null
  operating_area: string | null
  dpos: string | null
  ice_breaking: string | null
  url_ship: string | null
  vessel_of_opportunity: boolean | null
  daily_rate: number | null
  daily_rate_currency: string | null
  photo_urls: string[] | null
  status: SubmissionStatus
  admin_notes: string | null
  created_at: string
  reviewed_at: string | null
}

interface Claim {
  id: string
  vessel_id: number
  vessel_name: string
  claimant_name: string
  email: string
  role: string
  organization: string
  message: string | null
  status: ClaimStatus
  admin_notes: string | null
  created_at: string
  reviewed_at: string | null
}

interface Scientist {
  id: string
  email: string | null
  first_name: string | null
  last_name: string | null
  institution: string | null
  title: string | null
  profile_url: string | null
  verified: boolean
  created_at: string
}

interface VesselRow {
  id: number
  name: string
  country: string | null
  port_city: string | null
  status: 'active' | 'retired' | 'inactive' | 'deleted'
  year_built: number | null
  scientists: number | null
  length: number | null
  speed_cruise: number | null
  operator_name: string | null
}

type VesselStatusFilter = 'all' | 'active' | 'retired' | 'inactive' | 'deleted'

type VesselColKey = 'country' | 'port_city' | 'operator_name' | 'year_built' | 'length' | 'speed_cruise' | 'scientists'

const VESSEL_COLS: { key: VesselColKey; label: string }[] = [
  { key: 'country', label: 'Country' },
  { key: 'port_city', label: 'Port' },
  { key: 'operator_name', label: 'Operator' },
  { key: 'year_built', label: 'Built' },
  { key: 'length', label: 'Length (m)' },
  { key: 'speed_cruise', label: 'Speed (kn)' },
  { key: 'scientists', label: 'Scientists' },
]

type Tab = 'submissions' | 'claims' | 'scientists' | 'vessels' | 'analytics' | 'messages' | 'changes'
type ChangesWindow = 'hour' | 'day' | 'week' | 'month' | 'year' | 'all'
const CHANGES_WINDOWS: { value: ChangesWindow; label: string }[] = [
  { value: 'hour', label: 'Hour' },
  { value: 'day', label: 'Day' },
  { value: 'week', label: 'Week' },
  { value: 'month', label: 'Month' },
  { value: 'year', label: 'Year' },
  { value: 'all', label: 'All time' },
]

interface DataChange {
  id: string
  vessel_id: number | null
  vessel_name: string | null
  table_name: string
  record_id: string | null
  field: string
  old_value: string | null
  new_value: string | null
  actor: string | null
  batch: string
  changed_at: string
}

interface AdminMessage {
  id: string
  thread_id: string
  vessel_id: number
  author_id: string
  author_role: 'scientist' | 'operator'
  body: string
  status: string
  created_at: string
  is_root: boolean
  author_name: string | null
  author_email: string | null
  author_institution: string | null
  vessel_name: string
}
type Filter = 'all' | 'pending' | 'approved' | 'rejected'


function StatusBadge({ status }: { status: string }) {
  const styles: Record<string, string> = {
    pending: 'bg-yellow-50 text-yellow-700 border-yellow-200',
    approved: 'bg-teal-50 text-teal border-teal/20',
    rejected: 'bg-red-50 text-red-600 border-red-100',
  }
  return (
    <span className={`text-xs font-semibold px-2.5 py-1 rounded-full border ${styles[status] ?? ''}`}>
      {status}
    </span>
  )
}

function fmt(dateStr: string) {
  return new Date(dateStr).toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric', hour: '2-digit', minute: '2-digit' })
}

interface RowActionsProps {
  id: string
  status: string
  apiPath: 'submissions' | 'claims'
  onUpdate: (id: string, status: 'approved' | 'rejected', notes: string) => void
}

function RowActions({ id, status, apiPath, onUpdate }: RowActionsProps) {
  const [notes, setNotes] = useState('')
  const [loading, setLoading] = useState<'approved' | 'rejected' | null>(null)
  const [error, setError] = useState<string | null>(null)

  if (status !== 'pending') return null

  const act = async (newStatus: 'approved' | 'rejected') => {
    setLoading(newStatus)
    setError(null)
    try {
      const res = await fetch(`/api/admin/${apiPath}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ id, status: newStatus, admin_notes: notes }),
      })
      if (!res.ok) throw new Error(await res.text())
      onUpdate(id, newStatus, notes)
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Action failed')
    } finally {
      setLoading(null)
    }
  }

  return (
    <div className="mt-4 space-y-3">
      <div>
        <label className="block text-xs font-medium text-gray-500 mb-1.5">Admin notes (optional — included in email)</label>
        <textarea
          rows={2}
          value={notes}
          onChange={(e) => setNotes(e.target.value)}
          placeholder="Optional notes for the applicant…"
          className="w-full border border-gray-200 rounded-xl px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-teal focus:border-transparent resize-none"
        />
      </div>
      {error && <p className="text-xs text-red-500">{error}</p>}
      <div className="flex gap-2">
        <button
          disabled={!!loading}
          onClick={() => act('approved')}
          className="flex items-center gap-1.5 bg-teal text-white px-4 py-2 rounded-xl text-sm font-medium hover:bg-teal-600 transition-colors disabled:opacity-50"
        >
          {loading === 'approved' ? <Spinner /> : null}
          Approve
        </button>
        <button
          disabled={!!loading}
          onClick={() => act('rejected')}
          className="flex items-center gap-1.5 border border-red-200 text-red-600 px-4 py-2 rounded-xl text-sm font-medium hover:bg-red-50 transition-colors disabled:opacity-50"
        >
          {loading === 'rejected' ? <Spinner /> : null}
          Reject
        </button>
      </div>
    </div>
  )
}

function Spinner() {
  return (
    <svg className="w-3.5 h-3.5 animate-spin" fill="none" viewBox="0 0 24 24">
      <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
      <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z" />
    </svg>
  )
}

function ScientistActions({ scientist, onUpdate }: {
  scientist: Scientist
  onUpdate: (id: string, verified: boolean) => void
}) {
  const [notes, setNotes] = useState('')
  const [loading, setLoading] = useState<'approve' | 'reject' | null>(null)
  const [error, setError] = useState<string | null>(null)

  const act = async (action: 'approve' | 'reject') => {
    setLoading(action)
    setError(null)
    try {
      const res = await fetch('/api/admin/scientists', {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ id: scientist.id, action, notes }),
      })
      if (!res.ok) throw new Error(await res.text())
      onUpdate(scientist.id, action === 'approve')
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Action failed')
    } finally {
      setLoading(null)
    }
  }

  return (
    <div className="mt-4 space-y-3">
      <div>
        <label className="block text-xs font-medium text-gray-500 mb-1.5">Notes (optional — included in email)</label>
        <textarea
          rows={2}
          value={notes}
          onChange={(e) => setNotes(e.target.value)}
          placeholder="e.g. Welcome aboard!"
          className="w-full border border-gray-200 rounded-xl px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-teal focus:border-transparent resize-none"
        />
      </div>
      {error && <p className="text-xs text-red-500">{error}</p>}
      <div className="flex gap-2">
        <button
          disabled={!!loading}
          onClick={() => act('approve')}
          className="flex items-center gap-1.5 bg-teal text-white px-4 py-2 rounded-xl text-sm font-medium hover:bg-teal-600 transition-colors disabled:opacity-50"
        >
          {loading === 'approve' ? <Spinner /> : null}
          Verify
        </button>
        <button
          disabled={!!loading}
          onClick={() => act('reject')}
          className="flex items-center gap-1.5 border border-red-200 text-red-600 px-4 py-2 rounded-xl text-sm font-medium hover:bg-red-50 transition-colors disabled:opacity-50"
        >
          {loading === 'reject' ? <Spinner /> : null}
          Reject
        </button>
      </div>
    </div>
  )
}

export default function AdminDashboard() {
  const router = useRouter()
  const searchParams = useSearchParams()
  const TABS: Tab[] = ['submissions', 'claims', 'scientists', 'vessels', 'messages', 'changes', 'analytics']
  // Tab lives in the URL (?tab=) so browser back/forward works; state follows the URL.
  const urlTab = searchParams.get('tab') as Tab | null
  const tab: Tab = urlTab && TABS.includes(urlTab) ? urlTab : 'submissions'
  const setTab = (t: Tab) => {
    router.push(t === 'submissions' ? '/admin' : `/admin?tab=${t}`, { scroll: false })
  }
  const [changesSort, setChangesSort] = useState<{ col: 'when' | 'who' | 'what' | 'field'; dir: 'asc' | 'desc' }>({ col: 'when', dir: 'desc' })
  const [changesSearch, setChangesSearch] = useState('') // input value (uncommitted)
  const [changesQuery, setChangesQuery] = useState('')   // committed via Search button / Enter
  const [changesWindow, setChangesWindow] = useState<ChangesWindow>('hour')
  const [changesLoading, setChangesLoading] = useState(false)
  const [changesCapped, setChangesCapped] = useState(false)
  const [filter, setFilter] = useState<Filter>('pending')
  const [vesselFilter, setVesselFilter] = useState<VesselStatusFilter>('all')
  const [submissions, setSubmissions] = useState<Submission[]>([])
  const [claims, setClaims] = useState<Claim[]>([])
  const [scientists, setScientists] = useState<Scientist[]>([])
  const [vessels, setVessels] = useState<VesselRow[]>([])
  const [messages, setMessages] = useState<AdminMessage[]>([])
  const [changes, setChanges] = useState<DataChange[]>([])
  const [vesselStatusPending, setVesselStatusPending] = useState<Record<number, boolean>>({})
  const [vesselSearch, setVesselSearch] = useState('')
  const [vesselCols, setVesselCols] = useState<Set<VesselColKey>>(new Set(['country', 'port_city', 'year_built']))
  const [vesselSort, setVesselSort] = useState<{ col: string; dir: 'asc' | 'desc' }>({ col: 'name', dir: 'asc' })
  const [showColPicker, setShowColPicker] = useState(false)
  const [loading, setLoading] = useState(true)
  const [expandedDesc, setExpandedDesc] = useState<Set<string>>(new Set())

  useEffect(() => {
    Promise.all([
      fetch('/api/admin/submissions').then((r) => r.json()),
      fetch('/api/admin/claims').then((r) => r.json()),
      fetch('/api/admin/scientists').then((r) => r.json()),
      fetch('/api/admin/vessels').then((r) => r.json()),
      fetch('/api/admin/messages').then((r) => r.json()),
    ]).then(([subs, cls, sci, vess, msgs]) => {
      setSubmissions(Array.isArray(subs) ? subs : [])
      setClaims(Array.isArray(cls) ? cls : [])
      setScientists(Array.isArray(sci) ? sci : [])
      setVessels(Array.isArray(vess) ? vess : [])
      setMessages(Array.isArray(msgs) ? msgs : [])
      setLoading(false)
    })
  }, [])


  // Server-side fetch: the time window + committed search term go to the API
  // (which searches values, fields, batches, vessel names, and actor names in
  // SQL). Search runs on button/Enter only — no per-keystroke queries.
  useEffect(() => {
    const controller = new AbortController()
    ;(async () => {
      setChangesLoading(true)
      try {
        const params = new URLSearchParams({ window: changesWindow })
        if (changesQuery) params.set('q', changesQuery)
        const res = await fetch(`/api/admin/changes?${params}`, { signal: controller.signal })
        const data = await res.json()
        setChanges(Array.isArray(data.changes) ? data.changes : [])
        setChangesCapped(!!data.capped)
      } catch {
        /* aborted or failed — keep current rows */
      } finally {
        setChangesLoading(false)
      }
    })()
    return () => controller.abort()
  }, [changesQuery, changesWindow])

  const sortedChanges = useMemo(() => {
    const key = (c: DataChange): string => {
      switch (changesSort.col) {
        case 'when': return c.changed_at
        case 'who': return (c.actor ?? '').toLowerCase()
        case 'what': return (c.vessel_name ?? c.table_name ?? '').toLowerCase()
        case 'field': return c.field
      }
    }
    const dir = changesSort.dir === 'asc' ? 1 : -1
    return [...changes].sort((a, b) => (key(a) < key(b) ? -dir : key(a) > key(b) ? dir : 0))
  }, [changes, changesSort])

  const toggleChangesSort = (col: 'when' | 'who' | 'what' | 'field') =>
    setChangesSort((s) => ({ col, dir: s.col === col && s.dir === 'desc' ? 'asc' : 'desc' }))

  const updateVesselStatus = async (id: number, status: VesselRow['status']) => {
    setVesselStatusPending((prev) => ({ ...prev, [id]: true }))
    try {
      const res = await fetch('/api/admin/vessels', {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ id, status }),
      })
      if (!res.ok) throw new Error(await res.text())
      setVessels((prev) => prev.map((v) => v.id === id ? { ...v, status } : v))
    } catch (e) {
      alert(e instanceof Error ? e.message : 'Failed to update status')
    } finally {
      setVesselStatusPending((prev) => ({ ...prev, [id]: false }))
    }
  }

  const toggleDesc = (id: string) =>
    setExpandedDesc((prev) => {
      const next = new Set(prev)
      next.has(id) ? next.delete(id) : next.add(id)
      return next
    })

  const updateSubmission = (id: string, status: 'approved' | 'rejected', notes: string) =>
    setSubmissions((prev) =>
      prev.map((s) => s.id === id ? { ...s, status, admin_notes: notes, reviewed_at: new Date().toISOString() } : s)
    )

  const updateClaim = (id: string, status: 'approved' | 'rejected', notes: string) =>
    setClaims((prev) =>
      prev.map((c) => c.id === id ? { ...c, status, admin_notes: notes, reviewed_at: new Date().toISOString() } : c)
    )

  const updateScientist = (id: string, verified: boolean) =>
    setScientists((prev) =>
      prev.map((s) => s.id === id ? { ...s, verified } : s)
    )

  const pendingSubs = submissions.filter((s) => s.status === 'pending').length
  const pendingClaims = claims.filter((c) => c.status === 'pending').length
  const pendingScientists = scientists.filter((s) => !s.verified).length

  const filteredSubs = filter === 'all' ? submissions : submissions.filter((s) => s.status === filter)
  const filteredClaims = filter === 'all' ? claims : claims.filter((c) => c.status === filter)
  const filteredScientists = tab === 'scientists'
    ? (filter === 'all' ? scientists : filter === 'pending' ? scientists.filter(s => !s.verified) : filter === 'approved' ? scientists.filter(s => s.verified) : [])
    : []

  return (
    <div className="pt-[88px] min-h-screen bg-gray-50">
      <div className="max-w-5xl mx-auto px-4 sm:px-6 lg:px-8 py-8">
        {/* Header */}
        <div className="flex items-center justify-between mb-6">
          <div>
            <h1 className="text-2xl font-bold text-navy">Admin Dashboard</h1>
            <p className="text-sm text-gray-500 mt-0.5">
              {pendingSubs} pending submission{pendingSubs !== 1 ? 's' : ''} · {pendingClaims} pending claim{pendingClaims !== 1 ? 's' : ''} · {pendingScientists} unverified scientist{pendingScientists !== 1 ? 's' : ''}
            </p>
          </div>
          <div className="flex items-center gap-2">
            <NotificationPrefsMenu />
            <a href="/admin/vessels/new" className="bg-navy text-white text-sm font-medium px-4 py-2 rounded-xl hover:bg-navy-600 transition-colors">+ Add Vessel</a>
          </div>
        </div>

        {/* Tabs */}
        <div className="flex items-center gap-1 bg-white rounded-2xl p-1 shadow-card mb-4 w-fit">
          {(['submissions', 'claims', 'scientists', 'vessels', 'messages', 'changes', 'analytics'] as Tab[]).map((t) => (
            <button
              key={t}
              onClick={() => setTab(t)}
              className={`px-5 py-2 rounded-xl text-sm font-medium transition-all ${
                tab === t ? 'bg-navy text-white shadow-sm' : 'text-gray-500 hover:text-navy'
              }`}
            >
              {t.charAt(0).toUpperCase() + t.slice(1)}
              {t === 'submissions' && pendingSubs > 0 && (
                <span className="ml-2 bg-gold text-navy text-xs font-bold px-1.5 py-0.5 rounded-full">
                  {pendingSubs}
                </span>
              )}
              {t === 'claims' && pendingClaims > 0 && (
                <span className="ml-2 bg-gold text-navy text-xs font-bold px-1.5 py-0.5 rounded-full">
                  {pendingClaims}
                </span>
              )}
              {t === 'scientists' && pendingScientists > 0 && (
                <span className="ml-2 bg-gold text-navy text-xs font-bold px-1.5 py-0.5 rounded-full">
                  {pendingScientists}
                </span>
              )}
            </button>
          ))}
        </div>

        {/* Filter pills */}
        {tab !== 'vessels' && tab !== 'analytics' && tab !== 'messages' && tab !== 'changes' && (
          <div className="flex items-center gap-2 mb-6">
            {(['all', 'pending', 'approved', 'rejected'] as Filter[]).map((f) => (
              <button
                key={f}
                onClick={() => setFilter(f)}
                className={`px-3 py-1.5 rounded-full text-xs font-medium border transition-all ${
                  filter === f
                    ? 'bg-navy text-white border-navy'
                    : 'bg-white text-gray-500 border-gray-200 hover:border-gray-400'
                }`}
              >
                {f.charAt(0).toUpperCase() + f.slice(1)}
              </button>
            ))}
          </div>
        )}
        {tab === 'vessels' && (
          <div className="flex items-center gap-2 mb-6 flex-wrap">
            {(['all', 'active', 'retired', 'inactive', 'deleted'] as VesselStatusFilter[]).map((f) => (
              <button
                key={f}
                onClick={() => setVesselFilter(f)}
                className={`px-3 py-1.5 rounded-full text-xs font-medium border transition-all ${
                  vesselFilter === f
                    ? 'bg-navy text-white border-navy'
                    : 'bg-white text-gray-500 border-gray-200 hover:border-gray-400'
                }`}
              >
                {f.charAt(0).toUpperCase() + f.slice(1)}
              </button>
            ))}
          </div>
        )}

        {loading ? (
          <div className="text-center py-16 text-gray-400">Loading…</div>
        ) : (
          <div className="space-y-4">
            {tab === 'submissions' && (
              filteredSubs.length === 0 ? (
                <div className="text-center py-16 text-gray-400">No submissions to show.</div>
              ) : filteredSubs.map((sub) => (
                <div key={sub.id} className="bg-white rounded-2xl shadow-card p-6">
                  <div className="flex items-start justify-between gap-4">
                    <div className="flex-1 min-w-0 flex items-start gap-4">
                      {(sub.photo_urls?.length ?? 0) > 0 && (
                        <a
                          href={sub.photo_urls![0]}
                          target="_blank"
                          rel="noopener noreferrer"
                          className="relative flex-shrink-0 w-24 aspect-video rounded-lg overflow-hidden bg-gray-100 block"
                          title="Open full size"
                        >
                          {/* eslint-disable-next-line @next/next/no-img-element */}
                          <img src={sub.photo_urls![0]} alt={`${sub.vessel_name} photo`} className="w-full h-full object-cover" />
                          {sub.photo_urls!.length > 1 && (
                            <span className="absolute bottom-0.5 right-0.5 bg-black/60 text-white text-[10px] font-medium px-1 rounded">
                              +{sub.photo_urls!.length - 1}
                            </span>
                          )}
                        </a>
                      )}
                      <div className="flex-1 min-w-0">
                        <div className="flex items-center gap-3 flex-wrap">
                          <h3 className="font-semibold text-navy text-lg">{sub.vessel_name}</h3>
                          {sub.vessel_of_opportunity === true ? (
                            <span
                              className="bg-amber-50 text-amber-700 text-xs font-semibold px-2 py-0.5 rounded-full border border-amber-200"
                              title="Pleasure craft / fishing / working vessel that can also host research"
                            >
                              Vessel of opportunity
                            </span>
                          ) : (
                            <span className="bg-navy-50 text-navy text-xs font-semibold px-2 py-0.5 rounded-full border border-navy/10">
                              Research vessel
                            </span>
                          )}
                          <StatusBadge status={sub.status} />
                        </div>
                        <div className="mt-1.5 flex flex-wrap gap-x-4 gap-y-1 text-sm text-gray-500">
                          <span>{sub.operator_name}</span>
                          <a href={`mailto:${sub.email}`} className="text-teal hover:underline">{sub.email}</a>
                          <span>{[sub.port_city, sub.port_state, sub.country].filter(Boolean).join(', ')}</span>
                          {sub.daily_rate != null && (
                            <span className="font-medium text-navy">{fmtDailyRate(sub.daily_rate, sub.daily_rate_currency)}/day</span>
                          )}
                        </div>
                        <p className="text-xs text-gray-400 mt-1">Submitted {fmt(sub.created_at)}</p>
                      </div>
                    </div>
                  </div>

                  <div className="mt-4">
                    <button
                      onClick={() => toggleDesc(sub.id)}
                      className="text-xs text-teal font-medium hover:underline"
                    >
                      {expandedDesc.has(sub.id) ? 'Hide details' : 'Show details'}
                    </button>
                    {expandedDesc.has(sub.id) && (
                      <div className="mt-3 space-y-3">
                        {/* Identification */}
                        <div className="grid grid-cols-2 sm:grid-cols-4 gap-2">
                          {[
                            { label: 'Port City', value: sub.port_city || null },
                            { label: 'State / Province', value: sub.port_state },
                            { label: 'Country', value: sub.country },
                            { label: 'MMSI', value: sub.mmsi },
                            { label: 'IMO', value: sub.imo_number },
                            { label: 'Call Sign', value: sub.call_sign },
                          ].filter(s => s.value).map(s => (
                            <div key={s.label} className="bg-gray-50 rounded-xl p-3">
                              <p className="text-xs text-gray-400 uppercase tracking-wide mb-0.5">{s.label}</p>
                              <p className="text-sm font-semibold text-navy font-mono">{s.value}</p>
                            </div>
                          ))}
                        </div>
                        {/* Specs */}
                        <div className="grid grid-cols-2 sm:grid-cols-4 gap-2">
                          {[
                            { label: 'Length', value: sub.length_m != null ? `${sub.length_m} m` : null },
                            { label: 'Beam', value: sub.beam_m != null ? `${sub.beam_m} m` : null },
                            { label: 'Draft', value: sub.draft_m != null ? `${sub.draft_m} m` : null },
                            { label: 'Year Built', value: sub.year_built },
                            { label: 'Year Refit', value: sub.year_refit },
                            { label: 'Cruise Speed', value: sub.speed_cruise != null ? `${sub.speed_cruise} kn` : null },
                            { label: 'Max Speed', value: sub.speed_max != null ? `${sub.speed_max} kn` : null },
                            { label: 'Research Bunks', value: sub.scientists },
                            { label: 'Crew', value: sub.crew },
                            { label: 'Endurance', value: sub.endurance },
                            { label: 'DPos', value: sub.dpos },
                            { label: 'Ice Class', value: sub.ice_breaking },
                            { label: 'Operating Area', value: sub.operating_area },
                          ].filter(s => s.value != null && s.value !== '').map(s => (
                            <div key={s.label} className="bg-gray-50 rounded-xl p-3">
                              <p className="text-xs text-gray-400 uppercase tracking-wide mb-0.5">{s.label}</p>
                              <p className="text-sm font-semibold text-navy">{s.value}</p>
                            </div>
                          ))}
                        </div>
                        {/* Activity */}
                        {sub.main_activity && (
                          <div className="bg-gray-50 rounded-xl p-4">
                            <p className="text-xs text-gray-400 uppercase tracking-wide mb-1">Research Activity</p>
                            <p className="text-sm text-gray-700 leading-relaxed">{sub.main_activity}</p>
                          </div>
                        )}
                        {/* URL */}
                        {sub.url_ship && (
                          <a href={sub.url_ship} target="_blank" rel="noopener noreferrer"
                            className="text-xs text-teal hover:underline inline-flex items-center gap-1">
                            {sub.url_ship}
                            <svg className="w-3 h-3" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M10 6H6a2 2 0 00-2 2v10a2 2 0 002 2h10a2 2 0 002-2v-4M14 4h6m0 0v6m0-6L10 14" />
                            </svg>
                          </a>
                        )}
                      </div>
                    )}
                  </div>

                  {sub.admin_notes && sub.status !== 'pending' && (
                    <p className="mt-3 text-xs text-gray-500 bg-gray-50 rounded-xl px-3 py-2">
                      <span className="font-medium">Notes:</span> {sub.admin_notes}
                    </p>
                  )}

                  <RowActions id={sub.id} status={sub.status} apiPath="submissions" onUpdate={updateSubmission} />
                </div>
              ))
            )}

            {tab === 'claims' && (
              filteredClaims.length === 0 ? (
                <div className="text-center py-16 text-gray-400">No claims to show.</div>
              ) : filteredClaims.map((claim) => (
                <div key={claim.id} className="bg-white rounded-2xl shadow-card p-6">
                  <div className="flex items-start justify-between gap-4">
                    <div className="flex-1 min-w-0">
                      <div className="flex items-center gap-3 flex-wrap">
                        <h3 className="font-semibold text-navy text-lg">
                          <a
                            href={`/vessels/${claim.vessel_id}`}
                            target="_blank"
                            rel="noopener noreferrer"
                            className="hover:text-teal transition-colors"
                          >
                            {claim.vessel_name}
                          </a>
                        </h3>
                        <StatusBadge status={claim.status} />
                      </div>
                      <div className="mt-1.5 flex flex-wrap gap-x-4 gap-y-1 text-sm text-gray-500">
                        <span>{claim.claimant_name}</span>
                        <span className="text-gray-400">{claim.role} · {claim.organization}</span>
                        <a href={`mailto:${claim.email}`} className="text-teal hover:underline">{claim.email}</a>
                      </div>
                      <p className="text-xs text-gray-400 mt-1">Submitted {fmt(claim.created_at)}</p>
                    </div>
                  </div>

                  {claim.message && (
                    <div className="mt-3">
                      <button
                        onClick={() => toggleDesc(claim.id)}
                        className="text-xs text-teal font-medium hover:underline"
                      >
                        {expandedDesc.has(claim.id) ? 'Hide details' : 'Show details'}
                      </button>
                      {expandedDesc.has(claim.id) && (
                        <div className="mt-2 space-y-2">
                          <p className="text-sm text-gray-600 bg-gray-50 rounded-xl p-4 leading-relaxed">
                            {claim.message}
                          </p>
                          {(claim as Claim & { document_url?: string }).document_url && (
                            <a
                              href={(claim as Claim & { document_url?: string }).document_url}
                              target="_blank"
                              rel="noopener noreferrer"
                              className="inline-flex items-center gap-1.5 text-xs text-teal font-medium hover:underline"
                            >
                              <svg className="w-3.5 h-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 12h6m-6 4h6m2 5H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z" />
                              </svg>
                              View supporting document
                            </a>
                          )}
                        </div>
                      )}
                    </div>
                  )}

                  {claim.admin_notes && claim.status !== 'pending' && (
                    <p className="mt-3 text-xs text-gray-500 bg-gray-50 rounded-xl px-3 py-2">
                      <span className="font-medium">Notes:</span> {claim.admin_notes}
                    </p>
                  )}

                  <RowActions id={claim.id} status={claim.status} apiPath="claims" onUpdate={updateClaim} />
                </div>
              ))
            )}

            {tab === 'vessels' && (() => {
              const vesselStatusStyles: Record<string, string> = {
                active: 'bg-green-50 text-green-700 border-green-200',
                retired: 'bg-gray-100 text-gray-600 border-gray-300',
                inactive: 'bg-yellow-50 text-yellow-700 border-yellow-200',
                deleted: 'bg-red-50 text-red-600 border-red-100',
              }

              const toggleSort = (col: string) =>
                setVesselSort((s) => s.col === col ? { col, dir: s.dir === 'asc' ? 'desc' : 'asc' } : { col, dir: 'asc' })

              const SortIcon = ({ col }: { col: string }) => {
                if (vesselSort.col !== col) return <span className="ml-1 text-gray-300">↕</span>
                return <span className="ml-1">{vesselSort.dir === 'asc' ? '↑' : '↓'}</span>
              }

              const filtered = vessels
                .filter((v) => vesselFilter === 'all' || v.status === vesselFilter)
                .filter((v) => !vesselSearch || v.name.toLowerCase().includes(vesselSearch.toLowerCase()))
                .sort((a, b) => {
                  const col = vesselSort.col as keyof VesselRow
                  const av = a[col] ?? ''
                  const bv = b[col] ?? ''
                  const cmp = av < bv ? -1 : av > bv ? 1 : 0
                  return vesselSort.dir === 'asc' ? cmp : -cmp
                })

              const activeCols = VESSEL_COLS.filter((c) => vesselCols.has(c.key))

              return (
                <div className="space-y-3">
                  {/* Search + column picker */}
                  <div className="flex items-center gap-3">
                    <input
                      type="text"
                      value={vesselSearch}
                      onChange={(e) => setVesselSearch(e.target.value)}
                      placeholder="Search vessels…"
                      className="flex-1 border border-gray-200 rounded-xl px-3.5 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-teal/40 focus:border-transparent"
                    />
                    <div className="relative">
                      <button
                        onClick={() => setShowColPicker((p) => !p)}
                        className="flex items-center gap-2 border border-gray-200 rounded-xl px-3.5 py-2 text-sm text-gray-600 hover:border-gray-400 transition-colors"
                      >
                        <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 17V7m0 10a2 2 0 01-2 2H5a2 2 0 01-2-2V7a2 2 0 012-2h2a2 2 0 012 2m0 10a2 2 0 002 2h2a2 2 0 002-2M9 7a2 2 0 012-2h2a2 2 0 012 2m0 10V7m0 10a2 2 0 002 2h2a2 2 0 002-2V7a2 2 0 00-2-2h-2a2 2 0 00-2 2" />
                        </svg>
                        Columns
                      </button>
                      {showColPicker && (
                        <div className="absolute right-0 top-full mt-1 bg-white border border-gray-200 rounded-xl shadow-lg p-3 z-10 min-w-[160px]">
                          {VESSEL_COLS.map((c) => (
                            <label key={c.key} className="flex items-center gap-2 py-1 cursor-pointer text-sm text-gray-700 hover:text-navy">
                              <input
                                type="checkbox"
                                checked={vesselCols.has(c.key)}
                                onChange={() => setVesselCols((prev) => {
                                  const next = new Set(prev)
                                  next.has(c.key) ? next.delete(c.key) : next.add(c.key)
                                  return next
                                })}
                                className="rounded"
                              />
                              {c.label}
                            </label>
                          ))}
                        </div>
                      )}
                    </div>
                  </div>

                  <p className="text-xs text-gray-400">{filtered.length} vessel{filtered.length !== 1 ? 's' : ''}</p>

                  {filtered.length === 0 ? (
                    <div className="text-center py-16 text-gray-400">No vessels match.</div>
                  ) : (
                    <div className="bg-white rounded-2xl shadow-card overflow-x-auto">
                      <table className="w-full text-sm">
                        <thead>
                          <tr className="border-b border-gray-100">
                            <th
                              className="text-left px-4 py-3 text-xs font-semibold text-gray-400 uppercase tracking-wide cursor-pointer hover:text-navy select-none whitespace-nowrap"
                              onClick={() => toggleSort('name')}
                            >
                              Name <SortIcon col="name" />
                            </th>
                            {activeCols.map((c) => (
                              <th
                                key={c.key}
                                className="text-left px-4 py-3 text-xs font-semibold text-gray-400 uppercase tracking-wide cursor-pointer hover:text-navy select-none whitespace-nowrap"
                                onClick={() => toggleSort(c.key)}
                              >
                                {c.label} <SortIcon col={c.key} />
                              </th>
                            ))}
                            <th
                              className="text-left px-4 py-3 text-xs font-semibold text-gray-400 uppercase tracking-wide cursor-pointer hover:text-navy select-none whitespace-nowrap"
                              onClick={() => toggleSort('status')}
                            >
                              Status <SortIcon col="status" />
                            </th>
                          </tr>
                        </thead>
                        <tbody>
                          {filtered.map((v) => (
                            <tr key={v.id} className="border-b border-gray-50 hover:bg-gray-50 transition-colors">
                              <td className="px-4 py-3">
                                <a
                                  href={`/admin/vessels/${v.id}/edit`}
                                  target="_blank"
                                  rel="noopener noreferrer"
                                  className="font-medium text-navy hover:text-teal transition-colors"
                                >
                                  {v.name}
                                </a>
                              </td>
                              {activeCols.map((c) => (
                                <td key={c.key} className="px-4 py-3 text-gray-500 whitespace-nowrap">
                                  {v[c.key] ?? '—'}
                                </td>
                              ))}
                              <td className="px-4 py-3">
                                <select
                                  value={v.status}
                                  disabled={!!vesselStatusPending[v.id]}
                                  onChange={(e) => updateVesselStatus(v.id, e.target.value as VesselRow['status'])}
                                  className={`text-xs font-semibold px-2.5 py-1 rounded-full border appearance-none cursor-pointer disabled:opacity-50 ${vesselStatusStyles[v.status] ?? ''}`}
                                >
                                  <option value="active">active</option>
                                  <option value="retired">retired</option>
                                  <option value="inactive">inactive</option>
                                  <option value="deleted">deleted</option>
                                </select>
                              </td>
                            </tr>
                          ))}
                        </tbody>
                      </table>
                    </div>
                  )}
                </div>
              )
            })()}

            {tab === 'analytics' && <AnalyticsTab />}

            {tab === 'changes' && (
                <div className="bg-white rounded-2xl shadow-card overflow-hidden">
                  <div className="px-6 py-3 border-b border-gray-100 flex flex-wrap items-center justify-between gap-3">
                    <div className="flex items-center gap-1 flex-wrap">
                      {CHANGES_WINDOWS.map((w) => (
                        <button
                          key={w.value}
                          onClick={() => setChangesWindow(w.value)}
                          className={`text-xs font-medium px-2.5 py-1 rounded-full transition-colors ${
                            changesWindow === w.value ? 'bg-navy text-white' : 'bg-gray-100 text-gray-500 hover:bg-gray-200'
                          }`}
                        >
                          {w.label}
                        </button>
                      ))}
                    </div>
                    <div className="flex items-center gap-3">
                      <p className="text-xs text-gray-400">
                        {changesLoading ? 'Searching…' : `${changes.length} change${changes.length === 1 ? '' : 's'}${changesCapped ? ' (showing first 1,000)' : ''}`}
                      </p>
                      <form
                        onSubmit={(e) => { e.preventDefault(); setChangesQuery(changesSearch.trim()) }}
                        className="flex items-center gap-2"
                      >
                        <input
                          type="search"
                          value={changesSearch}
                          onChange={(e) => {
                            setChangesSearch(e.target.value)
                            if (e.target.value === '') setChangesQuery('') // clearing resets immediately
                          }}
                          placeholder="Search vessel, user, field, value…"
                          className="border border-gray-200 rounded-lg px-3 py-1.5 text-sm w-56 focus:outline-none focus:ring-2 focus:ring-teal/40 focus:border-transparent"
                        />
                        <button
                          type="submit"
                          className="bg-navy text-white text-sm font-medium px-3 py-1.5 rounded-lg hover:bg-navy-600 transition-colors"
                        >
                          Search
                        </button>
                      </form>
                    </div>
                  </div>
                  {changes.length === 0 && !changesLoading && (
                    <div className="text-center py-16 text-gray-400">
                      {changesQuery ? 'No changes match that search in this period.' : 'No changes in this period.'}
                    </div>
                  )}
                  {changes.length > 0 && (
                  <div className="overflow-x-auto">
                    <table className="w-full text-sm">
                      <thead>
                        <tr className="text-left text-xs text-gray-400 uppercase tracking-wide border-b border-gray-100">
                          {([['when', 'When', 'px-6'], ['who', 'Who', 'px-3'], ['what', 'What', 'px-3'], ['field', 'Field', 'px-3']] as const).map(([col, label, pad]) => (
                            <th key={col} className={`${pad} py-2 font-medium`}>
                              <button onClick={() => toggleChangesSort(col)} className="flex items-center gap-1 uppercase tracking-wide hover:text-navy transition-colors">
                                {label}
                                {changesSort.col === col && <span>{changesSort.dir === 'asc' ? '↑' : '↓'}</span>}
                              </button>
                            </th>
                          ))}
                          <th className="px-3 py-2 font-medium">Change</th>
                        </tr>
                      </thead>
                      <tbody className="divide-y divide-gray-50">
                        {sortedChanges.map((c) => (
                          <tr key={c.id} className="align-top">
                            <td className="px-6 py-2 whitespace-nowrap text-xs text-gray-400">
                              {new Date(c.changed_at).toLocaleString('en-US', { month: 'short', day: 'numeric', hour: 'numeric', minute: '2-digit' })}
                            </td>
                            <td className="px-3 py-2 text-xs max-w-[130px]">
                              <span className={`break-words ${c.actor === 'service_role' || c.actor === 'postgres' ? 'text-gray-400' : 'font-medium text-navy'}`}>
                                {c.actor === 'service_role' || c.actor === 'postgres' ? 'script' : c.actor ?? '—'}
                              </span>
                              {c.batch !== 'trigger:update' && (
                                <span className="block w-fit mt-0.5 bg-gray-100 text-gray-500 text-[10px] px-1.5 py-0.5 rounded-full break-all">{c.batch}</span>
                              )}
                            </td>
                            <td className="px-3 py-2 text-xs max-w-[140px]">
                              {c.vessel_id ? (
                                <a href={`/vessels/${c.vessel_id}`} target="_blank" rel="noopener noreferrer" className="text-teal hover:underline font-medium break-words">
                                  {c.vessel_name ?? `vessel ${c.vessel_id}`}
                                </a>
                              ) : (
                                <span className="text-gray-500">{c.table_name.replace('vessel_', '')}</span>
                              )}
                              {c.table_name !== 'vessels' && c.vessel_id != null && (
                                <span className="ml-1 text-gray-300">({c.table_name.replace('vessel_', '')})</span>
                              )}
                            </td>
                            <td className="px-3 py-2 text-xs text-gray-600 font-mono break-all max-w-[120px]">{c.field}</td>
                            <td className="px-3 py-2 text-xs max-w-md">
                              <span className="text-gray-400 line-through break-all" title={c.old_value ?? ''}>
                                {c.old_value ? (c.old_value.length > 42 ? c.old_value.slice(0, 42) + '…' : c.old_value) : '∅'}
                              </span>
                              <span className="text-gray-300 mx-1.5">→</span>
                              <span className="text-gray-800 break-all" title={c.new_value ?? ''}>
                                {c.new_value ? (c.new_value.length > 42 ? c.new_value.slice(0, 42) + '…' : c.new_value) : '∅'}
                              </span>
                            </td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                  )}
                </div>
            )}

            {tab === 'messages' && (
              messages.length === 0 ? (
                <div className="text-center py-16 text-gray-400">No messages yet.</div>
              ) : messages.map((m) => (
                <div key={m.id} className="bg-white rounded-2xl shadow-card p-5">
                  <div className="flex items-start justify-between gap-4">
                    <div className="flex-1 min-w-0">
                      <div className="flex items-center gap-2 flex-wrap">
                        <span className="font-semibold text-navy">
                          {m.author_name || m.author_email || '—'}
                        </span>
                        <span className="text-xs text-gray-400">
                          ({m.author_role})
                        </span>
                        <span className={`text-[10px] font-semibold px-2 py-0.5 rounded-full border ${
                          m.is_root
                            ? 'bg-teal-50 text-teal border-teal/20'
                            : 'bg-gray-50 text-gray-500 border-gray-200'
                        }`}>
                          {m.is_root ? 'new thread' : 'reply'}
                        </span>
                      </div>
                      <div className="mt-1 flex flex-wrap gap-x-3 gap-y-1 text-xs text-gray-500">
                        {m.author_institution && <span>{m.author_institution}</span>}
                        {m.author_email && (
                          <a href={`mailto:${m.author_email}`} className="text-teal hover:underline">
                            {m.author_email}
                          </a>
                        )}
                        <a
                          href={`/vessels/${m.vessel_id}`}
                          target="_blank"
                          rel="noopener noreferrer"
                          className="text-teal hover:underline"
                        >
                          → {m.vessel_name}
                        </a>
                      </div>
                    </div>
                    <span className="text-xs text-gray-400 flex-shrink-0">{fmt(m.created_at)}</span>
                  </div>
                  <p className="mt-3 text-sm text-gray-700 leading-relaxed whitespace-pre-wrap line-clamp-3">
                    {m.body}
                  </p>
                </div>
              ))
            )}

            {tab === 'scientists' && (
              filteredScientists.length === 0 ? (
                <div className="text-center py-16 text-gray-400">No scientists to show.</div>
              ) : filteredScientists.map((scientist) => (
                <div key={scientist.id} className="bg-white rounded-2xl shadow-card p-6">
                  <div className="flex items-start justify-between gap-4">
                    <div className="flex-1 min-w-0">
                      <div className="flex items-center gap-3 flex-wrap">
                        <h3 className="font-semibold text-navy text-lg">
                          {[scientist.first_name, scientist.last_name].filter(Boolean).join(' ') || '—'}
                        </h3>
                        <span className={`text-xs font-semibold px-2.5 py-1 rounded-full border ${scientist.verified ? 'bg-teal-50 text-teal border-teal/20' : 'bg-yellow-50 text-yellow-700 border-yellow-200'}`}>
                          {scientist.verified ? 'verified' : 'pending'}
                        </span>
                      </div>
                      <div className="mt-1.5 flex flex-wrap gap-x-4 gap-y-1 text-sm text-gray-500">
                        {scientist.institution && <span>{scientist.institution}</span>}
                        {scientist.title && <span className="text-gray-400">{scientist.title}</span>}
                        {scientist.email && <a href={`mailto:${scientist.email}`} className="text-teal hover:underline">{scientist.email}</a>}
                      </div>
                      {scientist.profile_url && (
                        <a
                          href={scientist.profile_url}
                          target="_blank"
                          rel="noopener noreferrer"
                          className="text-xs text-teal hover:underline mt-1 inline-flex items-center gap-1"
                        >
                          {scientist.profile_url}
                          <svg className="w-3 h-3" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M10 6H6a2 2 0 00-2 2v10a2 2 0 002 2h10a2 2 0 002-2v-4M14 4h6m0 0v6m0-6L10 14" />
                          </svg>
                        </a>
                      )}
                      <p className="text-xs text-gray-400 mt-1">Signed up {fmt(scientist.created_at)}</p>
                    </div>
                  </div>
                  {!scientist.verified && (
                    <ScientistActions scientist={scientist} onUpdate={updateScientist} />
                  )}
                </div>
              ))
            )}
          </div>
        )}
      </div>
    </div>
  )
}
