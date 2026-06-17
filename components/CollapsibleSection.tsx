'use client'

import type { ReactNode } from 'react'

interface Props {
  open: boolean
  onToggle: () => void
  label: string
  count?: number
  children: ReactNode
}

export default function CollapsibleSection({ open, onToggle, label, count, children }: Props) {
  return (
    <div className="border border-gray-200 rounded-2xl overflow-hidden">
      <button
        type="button"
        onClick={onToggle}
        className="w-full flex items-center gap-3 px-4 py-3.5 text-left hover:bg-gray-50 transition-colors"
      >
        <svg
          className={`w-4 h-4 text-gray-400 transition-transform ${open ? 'rotate-90' : ''}`}
          fill="none"
          viewBox="0 0 24 24"
          stroke="currentColor"
          strokeWidth={2}
        >
          <path strokeLinecap="round" strokeLinejoin="round" d="M9 5l7 7-7 7" />
        </svg>
        <span className="text-sm font-semibold text-navy flex-1">{label}</span>
        {count != null && <span className="text-xs text-gray-400">{count} fields</span>}
      </button>
      {open && (
        <div className="px-4 pb-5 pt-4 space-y-4 border-t border-gray-100 bg-white">
          {children}
        </div>
      )}
    </div>
  )
}
