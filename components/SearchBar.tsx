'use client'

import { useState, useRef, useEffect } from 'react'

export interface SearchState {
  where: string
  when: string
  bunks: number
}

interface SearchBarProps {
  countries: string[]
  value: SearchState
  onChange: (s: SearchState) => void
}

export default function SearchBar({ countries, value, onChange }: SearchBarProps) {
  const [activePanel, setActivePanel] = useState<'where' | 'when' | 'bunks' | null>(null)
  const ref = useRef<HTMLDivElement>(null)

  // Close panels on outside click
  useEffect(() => {
    const handler = (e: MouseEvent) => {
      if (ref.current && !ref.current.contains(e.target as Node)) {
        setActivePanel(null)
      }
    }
    document.addEventListener('mousedown', handler)
    return () => document.removeEventListener('mousedown', handler)
  }, [])

  const ALIASES: Record<string, string[]> = {
    USA: ['united states', 'america', 'us', 'u.s.', 'u.s.a'],
    UK: ['united kingdom', 'britain', 'great britain', 'england'],
  }

  const filtered = value.where
    ? countries.filter((c) => {
        const q = value.where.toLowerCase()
        if (c.toLowerCase().includes(q)) return true
        const aliases = ALIASES[c] ?? []
        return aliases.some((a) => a.includes(q) || q.includes(a))
      })
    : countries

  return (
    <div ref={ref} className="relative w-full max-w-3xl mx-auto">
      {/* Pill */}
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
            {filtered.slice(0, 20).map((c) => (
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
  )
}
