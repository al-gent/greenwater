'use client'

import { useState, useRef, useEffect } from 'react'
import AdvancedSearch, { type AdvancedFilters, EMPTY_ADVANCED } from './AdvancedSearch'

export interface SearchState {
  where: string
  when: string
  bunks: number
}

interface SearchBarProps {
  countries: string[]
  value: SearchState
  onChange: (s: SearchState) => void
  advancedValue?: AdvancedFilters
  onAdvancedChange?: (f: AdvancedFilters) => void
  advancedActive?: boolean
}

export default function SearchBar({ countries, value, onChange, advancedValue, onAdvancedChange, advancedActive }: SearchBarProps) {
  const [activePanel, setActivePanel] = useState<'where' | 'when' | 'bunks' | null>(null)
  const [mobileOpen, setMobileOpen] = useState(false)
  const [mobilePanel, setMobilePanel] = useState<'where' | 'when' | 'bunks'>('where')
  const [showMobileAdvanced, setShowMobileAdvanced] = useState(false)
  const ref = useRef<HTMLDivElement>(null)

  // Close desktop panels on outside click
  useEffect(() => {
    const handler = (e: MouseEvent) => {
      if (ref.current && !ref.current.contains(e.target as Node)) {
        setActivePanel(null)
      }
    }
    document.addEventListener('mousedown', handler)
    return () => document.removeEventListener('mousedown', handler)
  }, [])

  // Lock body scroll when mobile overlay is open
  useEffect(() => {
    if (mobileOpen) {
      document.body.style.overflow = 'hidden'
    } else {
      document.body.style.overflow = ''
    }
    return () => { document.body.style.overflow = '' }
  }, [mobileOpen])

  const filtered = value.where
    ? countries.filter((c) => c.toLowerCase().includes(value.where.toLowerCase()))
    : countries

  const hasFilters = value.where || value.when || value.bunks > 0

  const mobileSummary = [
    value.where || null,
    value.when || null,
    value.bunks > 0 ? `${value.bunks}+ bunks` : null,
  ].filter(Boolean).join(' · ')

  return (
    <>
      {/* ── MOBILE TRIGGER (hidden on sm+) ── */}
      <button
        onClick={() => { setMobileOpen(true); setMobilePanel('where') }}
        className="sm:hidden w-full flex items-center gap-3 bg-white rounded-full shadow-lg border border-gray-200 px-4 py-3 text-left"
      >
        <svg className="w-4 h-4 text-gray-400 flex-shrink-0" fill="none" viewBox="0 0 24 24" stroke="currentColor">
          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M21 21l-4.35-4.35M17 11A6 6 0 1 1 5 11a6 6 0 0 1 12 0z" />
        </svg>
        <span className={`text-sm flex-1 truncate ${hasFilters ? 'text-navy font-medium' : 'text-gray-400'}`}>
          {mobileSummary || 'Start your search'}
        </span>
      </button>

      {/* ── MOBILE FULL-SCREEN OVERLAY ── */}
      {mobileOpen && (
        <div className="sm:hidden fixed inset-0 z-[200] bg-gray-100 flex flex-col">
          {/* Top bar */}
          <div className="flex items-center justify-end px-4 py-3">
            <button
              onClick={() => { setMobileOpen(false); setShowMobileAdvanced(false) }}
              className="w-8 h-8 rounded-full bg-white border border-gray-200 flex items-center justify-center text-gray-600"
            >
              <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
              </svg>
            </button>
          </div>

          {/* Sections */}
          <div className="flex-1 overflow-y-auto px-4 pb-4 space-y-3">

            {/* WHERE */}
            <div className="bg-white rounded-2xl shadow-sm overflow-hidden">
              <button
                className="w-full flex items-center justify-between px-5 py-4"
                onClick={() => setMobilePanel(mobilePanel === 'where' ? 'where' : 'where')}
              >
                <span className="font-bold text-xl text-gray-900">Where?</span>
                {value.where && <span className="text-sm text-navy font-medium">{value.where}</span>}
              </button>
              {mobilePanel === 'where' && (
                <div className="px-4 pb-4">
                  <div className="flex items-center gap-2 border border-gray-200 rounded-xl px-3.5 py-2.5 mb-3">
                    <svg className="w-4 h-4 text-gray-400 flex-shrink-0" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M21 21l-4.35-4.35M17 11A6 6 0 1 1 5 11a6 6 0 0 1 12 0z" />
                    </svg>
                    <input
                      autoFocus
                      type="text"
                      value={value.where}
                      onChange={(e) => onChange({ ...value, where: e.target.value })}
                      placeholder="Search destinations"
                      className="flex-1 text-sm focus:outline-none"
                    />
                    {value.where && (
                      <button onClick={() => onChange({ ...value, where: '' })}>
                        <svg className="w-3.5 h-3.5 text-gray-400" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
                        </svg>
                      </button>
                    )}
                  </div>
                  <div className="max-h-48 overflow-y-auto">
                    {filtered.map((c) => (
                      <button
                        key={c}
                        onClick={() => { onChange({ ...value, where: c }); setMobilePanel('when') }}
                        className={`w-full text-left px-2 py-2.5 text-sm flex items-center gap-3 rounded-lg ${value.where === c ? 'text-teal font-semibold' : 'text-gray-700'}`}
                      >
                        <svg className="w-4 h-4 text-gray-300 flex-shrink-0" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M17.657 16.657L13.414 20.9a1.998 1.998 0 01-2.827 0l-4.244-4.243a8 8 0 1111.314 0z" />
                        </svg>
                        {c}
                      </button>
                    ))}
                  </div>
                </div>
              )}
            </div>

            {/* HOW LONG */}
            <div className="bg-white rounded-2xl shadow-sm overflow-hidden">
              <button
                className="w-full flex items-center justify-between px-5 py-4"
                onClick={() => setMobilePanel(mobilePanel === 'when' ? 'where' : 'when')}
              >
                <span className="text-base font-semibold text-gray-700">How long</span>
                <span className={`text-sm ${value.when ? 'text-navy font-medium' : 'text-gray-400'}`}>
                  {value.when || 'Add dates'}
                </span>
              </button>
              {mobilePanel === 'when' && (
                <div className="px-5 pb-5">
                  <p className="text-xs font-semibold text-gray-500 uppercase tracking-wide mb-3">Expedition length</p>
                  <input
                    autoFocus
                    type="month"
                    value={value.when}
                    onChange={(e) => onChange({ ...value, when: e.target.value })}
                    className="w-full border border-gray-200 rounded-xl px-3.5 py-2.5 text-sm focus:outline-none"
                  />
                  {value.when && (
                    <button
                      onClick={() => onChange({ ...value, when: '' })}
                      className="mt-2 text-xs text-gray-400 w-full text-center"
                    >
                      Clear
                    </button>
                  )}
                </div>
              )}
            </div>

            {/* BUNKS */}
            <div className="bg-white rounded-2xl shadow-sm overflow-hidden">
              <button
                className="w-full flex items-center justify-between px-5 py-4"
                onClick={() => setMobilePanel(mobilePanel === 'bunks' ? 'where' : 'bunks')}
              >
                <span className="text-base font-semibold text-gray-700">Bunks needed</span>
                <span className={`text-sm ${value.bunks > 0 ? 'text-navy font-medium' : 'text-gray-400'}`}>
                  {value.bunks > 0 ? `${value.bunks}+ bunks` : 'Add scientists'}
                </span>
              </button>
              {mobilePanel === 'bunks' && (
                <div className="px-5 pb-5">
                  <p className="text-xs font-semibold text-gray-500 uppercase tracking-wide mb-4">Minimum research bunks</p>
                  <div className="flex items-center justify-between gap-4">
                    <button
                      onClick={() => onChange({ ...value, bunks: Math.max(0, value.bunks - 1) })}
                      disabled={value.bunks === 0}
                      className="w-9 h-9 rounded-full border border-gray-300 text-gray-600 flex items-center justify-center disabled:opacity-30 text-lg font-light"
                    >
                      −
                    </button>
                    <span className="text-2xl font-semibold text-navy w-8 text-center">{value.bunks}</span>
                    <button
                      onClick={() => onChange({ ...value, bunks: value.bunks + 1 })}
                      className="w-9 h-9 rounded-full border border-gray-300 text-gray-600 flex items-center justify-center text-lg font-light"
                    >
                      +
                    </button>
                  </div>
                </div>
              )}
            </div>

            {/* ADVANCED SEARCH */}
            {onAdvancedChange && (
              <div className="bg-white rounded-2xl shadow-sm overflow-hidden">
                <button
                  className="w-full flex items-center justify-between px-5 py-4"
                  onClick={() => setShowMobileAdvanced((v) => !v)}
                >
                  <span className="text-base font-semibold text-gray-700 flex items-center gap-2">
                    <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                      <path strokeLinecap="round" strokeLinejoin="round" d="M12 6V4m0 2a2 2 0 100 4m0-4a2 2 0 110 4m-6 8a2 2 0 100-4m0 4a2 2 0 110-4m0 4v2m0-6V4m6 6v10m6-2a2 2 0 100-4m0 4a2 2 0 110-4m0 4v2m0-6V4" />
                    </svg>
                    Advanced search
                    {advancedActive && (
                      <span className="inline-flex items-center justify-center w-4 h-4 bg-teal text-white text-[10px] font-bold rounded-full">✓</span>
                    )}
                  </span>
                  <svg className={`w-4 h-4 text-gray-400 transition-transform ${showMobileAdvanced ? 'rotate-180' : ''}`} fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                    <path strokeLinecap="round" strokeLinejoin="round" d="M19 9l-7 7-7-7" />
                  </svg>
                </button>
                {showMobileAdvanced && (
                  <div className="px-4 pb-4">
                    <AdvancedSearch
                      value={advancedValue ?? EMPTY_ADVANCED}
                      onChange={onAdvancedChange}
                      onClear={() => onAdvancedChange(EMPTY_ADVANCED)}
                    />
                  </div>
                )}
              </div>
            )}

          </div>

          {/* Bottom bar */}
          <div className="bg-white border-t border-gray-200 px-5 py-4 flex items-center justify-between">
            <button
              onClick={() => { onChange({ where: '', when: '', bunks: 0 }); onAdvancedChange?.(EMPTY_ADVANCED) }}
              className="text-sm font-semibold text-gray-700 underline underline-offset-2"
            >
              Clear all
            </button>
            <button
              onClick={() => { setMobileOpen(false); setShowMobileAdvanced(false) }}
              className="flex items-center gap-2 bg-navy text-white px-6 py-3 rounded-full text-sm font-semibold"
            >
              <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M21 21l-4.35-4.35M17 11A6 6 0 1 1 5 11a6 6 0 0 1 12 0z" />
              </svg>
              Search
            </button>
          </div>
        </div>
      )}

      {/* ── DESKTOP PILL (hidden on mobile) ── */}
      <div ref={ref} className="hidden sm:block relative w-full max-w-3xl mx-auto">
        <div className={`flex items-stretch bg-white rounded-full shadow-lg border transition-shadow ${activePanel ? 'shadow-xl' : 'hover:shadow-xl'}`}
          style={{ borderColor: activePanel ? '#2A7B6F' : '#e5e7eb' }}>

          {/* WHERE */}
          <button
            onClick={() => setActivePanel(activePanel === 'where' ? null : 'where')}
            className={`flex-1 text-left px-6 py-3.5 rounded-full transition-colors ${activePanel === 'where' ? 'bg-white' : 'hover:bg-gray-50'}`}
          >
            <div className="text-xs font-semibold text-gray-800 mb-0.5">Where</div>
            <div className={`text-sm truncate ${value.where ? 'text-navy font-medium' : 'text-gray-400'}`}>
              {value.where || 'Search destinations'}
            </div>
          </button>

          <div className="w-px bg-gray-200 my-3" />

          {/* WHEN */}
          <button
            onClick={() => setActivePanel(activePanel === 'when' ? null : 'when')}
            className={`flex-1 text-left px-6 py-3.5 rounded-full transition-colors ${activePanel === 'when' ? 'bg-white' : 'hover:bg-gray-50'}`}
          >
            <div className="text-xs font-semibold text-gray-800 mb-0.5">How long</div>
            <div className={`text-sm ${value.when ? 'text-navy font-medium' : 'text-gray-400'}`}>
              {value.when || 'Number of days'}
            </div>
          </button>

          <div className="w-px bg-gray-200 my-3" />

          {/* BUNKS */}
          <button
            onClick={() => setActivePanel(activePanel === 'bunks' ? null : 'bunks')}
            className={`flex-1 text-left px-6 py-3.5 rounded-full transition-colors ${activePanel === 'bunks' ? 'bg-white' : 'hover:bg-gray-50'}`}
          >
            <div className="text-xs font-semibold text-gray-800 mb-0.5">Bunks needed</div>
            <div className={`text-sm ${value.bunks > 0 ? 'text-navy font-medium' : 'text-gray-400'}`}>
              {value.bunks > 0 ? `${value.bunks}+ research bunks` : 'Add scientists'}
            </div>
          </button>

        </div>

        {/* WHERE dropdown */}
        {activePanel === 'where' && (
          <div className="absolute top-full mt-2 left-0 w-80 bg-white rounded-2xl shadow-xl border border-gray-100 overflow-hidden z-50">
            <div className="p-3">
              <input
                autoFocus
                type="text"
                value={value.where}
                onChange={(e) => onChange({ ...value, where: e.target.value })}
                placeholder="Country or region…"
                className="w-full border border-gray-200 rounded-xl px-3.5 py-2.5 text-sm focus:outline-none focus:ring-2 focus:border-transparent"
                style={{ '--tw-ring-color': '#2A7B6F' } as React.CSSProperties}
              />
            </div>
            <div className="max-h-56 overflow-y-auto pb-2">
              {value.where && (
                <button
                  onClick={() => { onChange({ ...value, where: '' }); setActivePanel(null) }}
                  className="w-full text-left px-4 py-2.5 text-sm text-gray-400 hover:bg-gray-50 flex items-center gap-2"
                >
                  <svg className="w-3.5 h-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
                  </svg>
                  Clear
                </button>
              )}
              {filtered.map((c) => (
                <button
                  key={c}
                  onClick={() => { onChange({ ...value, where: c }); setActivePanel(null) }}
                  className={`w-full text-left px-4 py-2.5 text-sm hover:bg-gray-50 flex items-center gap-3 ${value.where === c ? 'text-teal font-semibold' : 'text-gray-700'}`}
                >
                  <svg className="w-4 h-4 text-gray-300 flex-shrink-0" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M17.657 16.657L13.414 20.9a1.998 1.998 0 01-2.827 0l-4.244-4.243a8 8 0 1111.314 0z" />
                  </svg>
                  {c}
                </button>
              ))}
            </div>
          </div>
        )}

        {/* WHEN dropdown */}
        {activePanel === 'when' && (
          <div className="absolute top-full mt-2 left-1/2 -translate-x-1/2 w-72 bg-white rounded-2xl shadow-xl border border-gray-100 p-4 z-50">
            <p className="text-xs font-semibold text-gray-500 uppercase tracking-wide mb-3">Expedition length</p>
            <input
              type="month"
              value={value.when}
              onChange={(e) => onChange({ ...value, when: e.target.value })}
              className="w-full border border-gray-200 rounded-xl px-3.5 py-2.5 text-sm focus:outline-none focus:ring-2 focus:border-transparent"
            />
            {value.when && (
              <button
                onClick={() => { onChange({ ...value, when: '' }); setActivePanel(null) }}
                className="mt-2 text-xs text-gray-400 hover:text-gray-600 w-full text-center"
              >
                Clear dates
              </button>
            )}
          </div>
        )}

        {/* BUNKS dropdown */}
        {activePanel === 'bunks' && (
          <div className="absolute top-full mt-2 right-0 w-64 bg-white rounded-2xl shadow-xl border border-gray-100 p-5 z-50">
            <p className="text-xs font-semibold text-gray-500 uppercase tracking-wide mb-4">Minimum research bunks</p>
            <div className="flex items-center justify-between gap-4">
              <button
                onClick={() => onChange({ ...value, bunks: Math.max(0, value.bunks - 1) })}
                className="w-9 h-9 rounded-full border border-gray-300 text-gray-600 flex items-center justify-center hover:border-gray-400 disabled:opacity-30 text-lg font-light"
                disabled={value.bunks === 0}
              >
                −
              </button>
              <span className="text-2xl font-semibold text-navy w-8 text-center">{value.bunks}</span>
              <button
                onClick={() => onChange({ ...value, bunks: value.bunks + 1 })}
                className="w-9 h-9 rounded-full border border-gray-300 text-gray-600 flex items-center justify-center hover:border-gray-400 text-lg font-light"
              >
                +
              </button>
            </div>
            {value.bunks > 0 && (
              <button
                onClick={() => { onChange({ ...value, bunks: 0 }); setActivePanel(null) }}
                className="mt-4 text-xs text-gray-400 hover:text-gray-600 w-full text-center"
              >
                Clear
              </button>
            )}
          </div>
        )}
      </div>
    </>
  )
}
