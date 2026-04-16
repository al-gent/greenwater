'use client'

import { useEffect, useState } from 'react'

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

type Tab = 'submissions' | 'claims' | 'scientists'
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
  const [tab, setTab] = useState<Tab>('submissions')
  const [filter, setFilter] = useState<Filter>('pending')
  const [submissions, setSubmissions] = useState<Submission[]>([])
  const [claims, setClaims] = useState<Claim[]>([])
  const [scientists, setScientists] = useState<Scientist[]>([])
  const [loading, setLoading] = useState(true)
  const [expandedDesc, setExpandedDesc] = useState<Set<string>>(new Set())

  useEffect(() => {
    Promise.all([
      fetch('/api/admin/submissions').then((r) => r.json()),
      fetch('/api/admin/claims').then((r) => r.json()),
      fetch('/api/admin/scientists').then((r) => r.json()),
    ]).then(([subs, cls, sci]) => {
      setSubmissions(Array.isArray(subs) ? subs : [])
      setClaims(Array.isArray(cls) ? cls : [])
      setScientists(Array.isArray(sci) ? sci : [])
      setLoading(false)
    })
  }, [])

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
          <a href="/admin/vessels/new" className="bg-navy text-white text-sm font-medium px-4 py-2 rounded-xl hover:bg-navy-600 transition-colors">+ Add Vessel</a>
        </div>

        {/* Tabs */}
        <div className="flex items-center gap-1 bg-white rounded-2xl p-1 shadow-card mb-4 w-fit">
          {(['submissions', 'claims', 'scientists'] as Tab[]).map((t) => (
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
                    <div className="flex-1 min-w-0">
                      <div className="flex items-center gap-3 flex-wrap">
                        <h3 className="font-semibold text-navy text-lg">{sub.vessel_name}</h3>
                        <StatusBadge status={sub.status} />
                      </div>
                      <div className="mt-1.5 flex flex-wrap gap-x-4 gap-y-1 text-sm text-gray-500">
                        <span>{sub.operator_name}</span>
                        <a href={`mailto:${sub.email}`} className="text-teal hover:underline">{sub.email}</a>
                        <span>{[sub.port_city, sub.port_state, sub.country].filter(Boolean).join(', ')}</span>
                      </div>
                      <p className="text-xs text-gray-400 mt-1">Submitted {fmt(sub.created_at)}</p>
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
