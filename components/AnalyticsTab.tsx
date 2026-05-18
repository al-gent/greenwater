'use client'

import { useState, useEffect, useCallback } from 'react'

// ── Types ────────────────────────────────────────────────────────────────────

interface Filters {
  days: 7 | 30 | 90
  site: 'app' | 'cms' | 'both'
  bots: boolean   // true = include bots in results
  staff: boolean  // true = include staff in results
}

interface Headlines {
  uniqueVisitors: number
  prevUniqueVisitors: number
  totalViews: number
  vesselViews: number
  listVisits: number
  signups: number
}

interface FunnelData {
  visitors: number
  homepage: number
  vesselClick: number
  multiVessel: number
  signups: number
}

interface DailyPoint {
  date: string
  unique_visitors: number
  total_views: number
}

interface LabeledRow {
  label: string
  views?: number
  unique_visitors?: number
}

interface TopPage {
  path: string
  views: number
  unique_visitors: number
}

interface EntryPage {
  entry_page: string
  entries: number
}

interface Analytics {
  headlines: Headlines
  funnel: FunnelData
  daily: DailyPoint[]
  referrers: LabeledRow[]
  entryPages: EntryPage[]
  topPages: {
    vesselTotal: { total_views: number; unique_visitors: number } | null
    vessels: TopPage[]
    nonVessel: TopPage[]
  }
  listSources: LabeledRow[]
  countries: LabeledRow[]
  vesselsCreated: number
}

// ── Helpers ──────────────────────────────────────────────────────────────────

function pctChange(current: number, prev: number): number | null {
  if (prev === 0) return null
  return Math.round(((current - prev) / prev) * 100)
}

function convRate(num: number, den: number): string {
  if (den === 0) return '—'
  return `${Math.round((num / den) * 100)}%`
}

const n = (v: number) => v.toLocaleString()

// ── Sub-components ────────────────────────────────────────────────────────────

function HeadlineCard({
  label, value, change, sub, large = false,
}: {
  label: string
  value: number
  change?: number | null
  sub?: string
  large?: boolean
}) {
  return (
    <div className="bg-white rounded-2xl shadow-card p-5">
      <p className="text-xs font-medium text-gray-400 uppercase tracking-wide mb-1.5">{label}</p>
      <p className={`font-bold text-navy ${large ? 'text-4xl' : 'text-2xl'}`}>{n(value)}</p>
      <div className="flex flex-wrap items-center gap-2 mt-1">
        {change !== undefined && change !== null && (
          <span className={`text-xs font-semibold ${change >= 0 ? 'text-green-600' : 'text-red-500'}`}>
            {change >= 0 ? '+' : ''}{change}% vs prev period
          </span>
        )}
        {sub && <span className="text-xs text-gray-400">{sub}</span>}
      </div>
    </div>
  )
}

function BarDataTable({ rows, limit = 12 }: { rows: LabeledRow[]; limit?: number }) {
  if (rows.length === 0) return <p className="text-xs text-gray-400">No data yet.</p>
  const visible = rows.slice(0, limit)
  const max = Math.max(...visible.map(r => r.views ?? r.unique_visitors ?? 0), 1)
  return (
    <div className="space-y-2">
      {visible.map(row => {
        const val = row.views ?? row.unique_visitors ?? 0
        const pct = Math.round((val / max) * 100)
        return (
          <div key={row.label}>
            <div className="flex items-center justify-between mb-0.5">
              <span className="text-xs text-gray-600 truncate max-w-[200px]">{row.label}</span>
              <span className="text-xs font-semibold text-navy ml-2 flex-shrink-0">{n(val)}</span>
            </div>
            <div className="h-1 bg-gray-100 rounded-full overflow-hidden">
              <div className="h-full bg-teal/50 rounded-full" style={{ width: `${pct}%` }} />
            </div>
          </div>
        )
      })}
    </div>
  )
}

function BarChart({ data, days }: { data: DailyPoint[]; days: number }) {
  const W = 800
  const H = 150
  const Y_W = 30    // y-axis label column width
  const X_H = 20    // x-axis label row height
  const PLOT_H = H - X_H

  if (data.length === 0) return null

  const maxVal = Math.max(...data.map(d => d.unique_visitors), 1)
  const barW = (W - Y_W) / data.length
  const labelEvery = days <= 7 ? 1 : days <= 30 ? 5 : 14
  const gridVals = [maxVal, Math.round(maxVal / 2), 0]

  return (
    <svg viewBox={`0 0 ${W} ${H}`} className="w-full">
      {/* Y gridlines + labels */}
      {gridVals.map(v => {
        const y = PLOT_H - (v / maxVal) * PLOT_H
        return (
          <g key={v}>
            <line x1={Y_W} y1={y} x2={W} y2={y} stroke="#f3f4f6" strokeWidth={1} />
            <text x={Y_W - 4} y={y + 3} textAnchor="end" fontSize={9} fill="#9ca3af">{v}</text>
          </g>
        )
      })}

      {/* Bars + X labels */}
      {data.map((d, i) => {
        const h = Math.max((d.unique_visitors / maxVal) * PLOT_H, d.unique_visitors > 0 ? 1 : 0)
        const x = Y_W + i * barW
        const showLabel = i % labelEvery === 0 || i === data.length - 1
        return (
          <g key={d.date}>
            {h > 0 && (
              <rect x={x + 1} y={PLOT_H - h} width={Math.max(barW - 2, 1)} height={h} fill="#1B3A6B" rx={1}>
                <title>{d.date}: {n(d.unique_visitors)} unique sessions · {n(d.total_views)} views</title>
              </rect>
            )}
            {showLabel && (
              <text x={x + barW / 2} y={H - 4} textAnchor="middle" fontSize={9} fill="#9ca3af">
                {d.date.slice(5)}
              </text>
            )}
          </g>
        )
      })}
    </svg>
  )
}

// ── Main ─────────────────────────────────────────────────────────────────────

const DEFAULTS: Filters = { days: 30, site: 'app', bots: false, staff: false }

export default function AnalyticsTab() {
  const [filters, setFilters] = useState<Filters>(DEFAULTS)
  const [data, setData] = useState<Analytics | null>(null)
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)

  const loadData = useCallback(() => {
    setLoading(true)
    setError(null)
    const params = new URLSearchParams({
      days:  String(filters.days),
      site:  filters.site,
      bots:  String(filters.bots),
      staff: String(filters.staff),
    })
    fetch(`/api/admin/analytics?${params}`)
      .then(r => r.json())
      .then((d: Analytics & { error?: string }) => {
        if (d?.headlines) {
          setData(d)
        } else {
          setError(d?.error ?? 'Failed to load analytics')
        }
        setLoading(false)
      })
      .catch(() => { setError('Network error — check console'); setLoading(false) })
  }, [filters])

  useEffect(() => { loadData() }, [loadData])

  function set<K extends keyof Filters>(key: K, val: Filters[K]) {
    setFilters(f => ({ ...f, [key]: val }))
  }

  // Funnel step definitions
  const funnelSteps = data
    ? [
        { label: 'All visitors',   count: data.funnel.visitors },
        { label: 'Entered home',   count: data.funnel.homepage },
        { label: 'Vessel page',    count: data.funnel.vesselClick },
        { label: '2+ vessels',     count: data.funnel.multiVessel },
        { label: 'Signed up',      count: data.funnel.signups },
      ]
    : []

  const change = data
    ? pctChange(data.headlines.uniqueVisitors, data.headlines.prevUniqueVisitors)
    : undefined

  return (
    <div className="space-y-5">

      {/* ── Filter bar ──────────────────────────────────────────────────────── */}
      <div className="bg-white rounded-2xl shadow-card p-4 flex flex-wrap items-center gap-3">

        {/* Time range */}
        <div className="flex items-center gap-1 bg-gray-100 rounded-xl p-1">
          {([7, 30, 90] as const).map(d => (
            <button
              key={d}
              onClick={() => set('days', d)}
              className={`px-3 py-1.5 rounded-lg text-xs font-semibold transition-all ${
                filters.days === d ? 'bg-white text-navy shadow-sm' : 'text-gray-500 hover:text-navy'
              }`}
            >
              {d}d
            </button>
          ))}
        </div>

        {/* Property */}
        <div className="flex items-center gap-1 bg-gray-100 rounded-xl p-1">
          {([['app', 'App'], ['cms', 'Site'], ['both', 'Both']] as const).map(([val, label]) => (
            <button
              key={val}
              onClick={() => set('site', val)}
              className={`px-3 py-1.5 rounded-lg text-xs font-semibold transition-all ${
                filters.site === val ? 'bg-white text-navy shadow-sm' : 'text-gray-500 hover:text-navy'
              }`}
            >
              {label}
            </button>
          ))}
        </div>

        {/* Toggle switches */}
        <div className="flex items-center gap-4 ml-auto">
          {([['bots', 'Include bots'], ['staff', 'Include staff']] as const).map(([key, label]) => (
            <label key={key} className="flex items-center gap-1.5 cursor-pointer select-none">
              <input
                type="checkbox"
                className="sr-only"
                checked={filters[key]}
                onChange={() => setFilters(f => ({ ...f, [key]: !f[key] }))}
              />
              <div className={`w-8 h-4 rounded-full transition-colors relative ${filters[key] ? 'bg-teal' : 'bg-gray-200'}`}>
                <div className={`absolute top-0.5 w-3 h-3 bg-white rounded-full shadow-sm transition-all ${filters[key] ? 'left-[18px]' : 'left-0.5'}`} />
              </div>
              <span className="text-xs text-gray-500">{label}</span>
            </label>
          ))}

          {/* Refresh */}
          <button
            onClick={loadData}
            disabled={loading}
            className="w-7 h-7 flex items-center justify-center rounded-lg hover:bg-gray-100 transition-colors disabled:opacity-40"
            title="Refresh"
          >
            <svg className={`w-3.5 h-3.5 text-gray-400 ${loading ? 'animate-spin' : ''}`} fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
              <path strokeLinecap="round" strokeLinejoin="round" d="M4 4v5h.582m15.356 2A8.001 8.001 0 004.582 9m0 0H9m11 11v-5h-.581m0 0a8.003 8.003 0 01-15.357-2m15.357 2H15" />
            </svg>
          </button>
        </div>
      </div>

      {error && (
        <div className="bg-red-50 border border-red-100 rounded-2xl p-4 text-sm text-red-600 font-mono">
          {error}
        </div>
      )}

      {loading && !data && (
        <div className="text-center py-16 text-gray-400 text-sm">Loading…</div>
      )}

      {data && (
        <div className={`space-y-5 transition-opacity ${loading ? 'opacity-50' : 'opacity-100'}`}>

          {/* ── Headline cards ─────────────────────────────────────────────── */}
          <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
            <HeadlineCard
              label="Unique sessions"
              value={data.headlines.uniqueVisitors}
              change={change}
              large
            />
            <HeadlineCard
              label="Signups"
              value={data.headlines.signups}
              sub="new accounts"
            />
            <HeadlineCard
              label="Vessel views"
              value={data.headlines.vesselViews}
              sub="detail page hits"
            />
            <HeadlineCard
              label="/list visits"
              value={data.headlines.listVisits}
              sub="operator self-serve"
            />
          </div>

          {/* ── Funnel ─────────────────────────────────────────────────────── */}
          {filters.site !== 'cms' && <div className="bg-white rounded-2xl shadow-card p-5">
            <h3 className="text-sm font-semibold text-navy mb-4">Acquisition funnel</h3>
            <div className="flex items-center gap-0.5 overflow-x-auto pb-1">
              {funnelSteps.map((step, i) => (
                <div key={step.label} className="flex items-center flex-shrink-0">
                  {/* Step */}
                  <div className="text-center px-3 py-2 rounded-xl bg-gray-50 min-w-[88px]">
                    <p className="text-xl font-bold text-navy leading-tight">{n(step.count)}</p>
                    <p className="text-[11px] text-gray-400 mt-0.5 leading-snug">{step.label}</p>
                  </div>
                  {/* Arrow + conversion rate */}
                  {i < funnelSteps.length - 1 && (
                    <div className="flex flex-col items-center mx-1 flex-shrink-0">
                      <span className="text-[10px] font-semibold text-gray-400">
                        {convRate(funnelSteps[i + 1].count, step.count)}
                      </span>
                      <svg className="w-5 h-3 text-gray-300" fill="none" viewBox="0 0 20 12">
                        <path d="M0 6h16M12 1l5 5-5 5" stroke="currentColor" strokeWidth={1.5} strokeLinecap="round" strokeLinejoin="round"/>
                      </svg>
                    </div>
                  )}
                </div>
              ))}
            </div>
          </div>}

          {/* ── Acquisition ────────────────────────────────────────────────── */}
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            <div className="bg-white rounded-2xl shadow-card p-5">
              <h3 className="text-sm font-semibold text-navy mb-3">Referrers</h3>
              <BarDataTable rows={data.referrers} />
            </div>
            <div className="bg-white rounded-2xl shadow-card p-5">
              <h3 className="text-sm font-semibold text-navy mb-3">Entry pages</h3>
              <BarDataTable
                rows={data.entryPages.map(e => ({ label: e.entry_page, views: e.entries }))}
              />
            </div>
          </div>

          {/* ── Top pages ──────────────────────────────────────────────────── */}
          <div className={`grid grid-cols-1 gap-4 ${filters.site !== 'cms' ? 'sm:grid-cols-2' : ''}`}>
            {/* Vessel pages — only meaningful for app traffic */}
            {filters.site !== 'cms' && (
              <div className="bg-white rounded-2xl shadow-card p-5">
                <h3 className="text-sm font-semibold text-navy mb-3">Vessel pages</h3>
                <div className="flex items-center justify-between py-2 mb-2 border-b border-gray-100">
                  <span className="text-xs font-semibold text-gray-700">All vessel pages</span>
                  <div className="flex items-center gap-3">
                    <span className="text-xs text-gray-400">{n(data.topPages.vesselTotal?.unique_visitors ?? 0)} uniq</span>
                    <span className="text-sm font-bold text-navy">{n(data.topPages.vesselTotal?.total_views ?? 0)}</span>
                  </div>
                </div>
                <div className="space-y-1">
                  {data.topPages.vessels.map(p => (
                    <div key={p.path} className="flex items-center justify-between py-0.5">
                      <a
                        href={p.path}
                        target="_blank"
                        rel="noopener noreferrer"
                        className="text-xs text-gray-500 font-mono hover:text-teal transition-colors truncate max-w-[200px]"
                      >
                        {p.path}
                      </a>
                      <span className="text-xs font-semibold text-navy ml-2 flex-shrink-0">{n(p.views)}</span>
                    </div>
                  ))}
                </div>
              </div>
            )}

            {/* Non-vessel pages */}
            <div className="bg-white rounded-2xl shadow-card p-5">
              <h3 className="text-sm font-semibold text-navy mb-3">Top pages</h3>
              <div className="space-y-1.5">
                {data.topPages.nonVessel.map(p => (
                  <div key={p.path} className="flex items-center justify-between">
                    <span className="text-xs text-gray-500 font-mono truncate max-w-[200px]">{p.path}</span>
                    <div className="flex items-center gap-3 flex-shrink-0 ml-2">
                      <span className="text-xs text-gray-400">{n(p.unique_visitors)} uniq</span>
                      <span className="text-xs font-semibold text-navy">{n(p.views)}</span>
                    </div>
                  </div>
                ))}
              </div>
            </div>
          </div>

          {/* ── Operator metrics ───────────────────────────────────────────── */}
          <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
            <div className="sm:col-span-2 bg-white rounded-2xl shadow-card p-5">
              <h3 className="text-sm font-semibold text-navy mb-3">
                /list page — where visitors come from
              </h3>
              {data.listSources.length === 0 ? (
                <p className="text-xs text-gray-400">No /list traffic in this period.</p>
              ) : (
                <BarDataTable rows={data.listSources} />
              )}
            </div>
            <div className="bg-white rounded-2xl shadow-card p-5 flex flex-col gap-4">
              <div>
                <p className="text-3xl font-bold text-navy">{n(data.vesselsCreated)}</p>
                <p className="text-xs text-gray-400 mt-0.5">vessels added this period</p>
              </div>
              <div>
                <p className="text-3xl font-bold text-navy">{n(data.headlines.signups)}</p>
                <p className="text-xs text-gray-400 mt-0.5">new accounts</p>
              </div>
              <p className="text-xs text-gray-400 pt-1 border-t border-gray-100">
                Claims and submissions are in the other tabs.
              </p>
            </div>
          </div>

          {/* ── Time series ────────────────────────────────────────────────── */}
          <div className="bg-white rounded-2xl shadow-card p-5">
            <div className="flex items-baseline justify-between mb-4 gap-3">
              <h3 className="text-sm font-semibold text-navy">
                Daily unique sessions — {filters.days}d
              </h3>
              <span className="text-xs text-gray-400 flex-shrink-0">
                one session = one device per day
              </span>
            </div>
            <BarChart data={data.daily} days={filters.days} />
          </div>

          {/* ── Countries ──────────────────────────────────────────────────── */}
          <div className="bg-white rounded-2xl shadow-card p-5">
            <h3 className="text-sm font-semibold text-navy mb-3">Countries</h3>
            <BarDataTable
              rows={data.countries.map(c => ({ label: c.label, views: c.unique_visitors }))}
            />
          </div>

        </div>
      )}
    </div>
  )
}
