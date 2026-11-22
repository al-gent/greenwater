'use client'

import { useEffect, useMemo, useRef, useState } from 'react'

export interface VesselOption {
  id: number
  name: string
  country: string | null
  port_city: string | null
  claimed: boolean
}

export default function ClaimVesselPicker({
  vessels,
  selected,
  onSelect,
}: {
  vessels: VesselOption[]
  selected: VesselOption | null
  onSelect: (v: VesselOption | null) => void
}) {
  const [query, setQuery] = useState('')
  const [open, setOpen] = useState(false)
  const wrapRef = useRef<HTMLDivElement>(null)

  useEffect(() => {
    const onClick = (e: MouseEvent) => {
      if (wrapRef.current && !wrapRef.current.contains(e.target as Node)) setOpen(false)
    }
    document.addEventListener('mousedown', onClick)
    return () => document.removeEventListener('mousedown', onClick)
  }, [])

  const matches = useMemo(() => {
    const q = query.trim().toLowerCase()
    if (!q) return vessels.slice(0, 50)
    return vessels.filter((v) => v.name.toLowerCase().includes(q)).slice(0, 50)
  }, [vessels, query])

  if (selected) {
    return (
      <div className="flex items-center justify-between border border-teal bg-teal-50 rounded-xl px-3.5 py-2.5">
        <div>
          <p className="text-sm font-medium text-navy">{selected.name}</p>
          <p className="text-xs text-gray-500">
            {[selected.port_city, selected.country].filter(Boolean).join(', ')}
          </p>
        </div>
        <button
          type="button"
          onClick={() => { onSelect(null); setQuery('') }}
          className="text-sm text-gray-400 hover:text-red-500 px-2"
        >
          Change
        </button>
      </div>
    )
  }

  return (
    <div ref={wrapRef} className="relative">
      <input
        aria-label="Search vessels by name"
        type="text"
        value={query}
        onChange={(e) => { setQuery(e.target.value); setOpen(true) }}
        onFocus={() => setOpen(true)}
        placeholder="Search by vessel name…"
        className="w-full border border-gray-200 rounded-xl px-3.5 py-2.5 text-base sm:text-sm focus:outline-none focus:ring-2 focus:ring-teal focus:border-transparent transition"
      />
      {open && (
        <div className="absolute z-20 mt-1 w-full bg-white border border-gray-200 rounded-xl shadow-card max-h-64 overflow-y-auto">
          {matches.length === 0 ? (
            <p className="px-3.5 py-3 text-sm text-gray-400">No vessels match &ldquo;{query}&rdquo;</p>
          ) : (
            matches.map((v) => (
              <button
                key={v.id}
                type="button"
                onClick={() => { onSelect(v); setOpen(false) }}
                className="w-full text-left px-3.5 py-2.5 hover:bg-gray-50 border-b border-gray-50 last:border-b-0"
              >
                <span className="text-sm text-navy font-medium">{v.name}</span>
                {v.claimed && (
                  <span className="ml-2 text-[10px] uppercase tracking-wide bg-gray-100 text-gray-500 rounded-full px-2 py-0.5">Has operator</span>
                )}
                <span className="block text-xs text-gray-400">
                  {[v.port_city, v.country].filter(Boolean).join(', ')}
                </span>
              </button>
            ))
          )}
        </div>
      )}
    </div>
  )
}
