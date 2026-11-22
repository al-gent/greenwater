'use client'

import { useAppearance } from './AppearanceProvider'

export default function AppearanceControl() {
  const { dark, choose } = useAppearance()
  return (
    <button
      type="button"
      aria-label="Appearance: dark mode"
      aria-pressed={dark}
      title={dark ? 'Switch to light mode' : 'Switch to dark mode'}
      onClick={() => choose(dark ? 'light' : 'dark')}
      className="-ml-3 mt-2 inline-flex h-9 items-center gap-1.5 rounded-full px-3 text-white hover:bg-white/10 focus-visible:ring-2 focus-visible:ring-white"
    >
      <svg aria-hidden="true" width="18" height="18" viewBox="0 0 20 20" fill="none" stroke="currentColor" strokeWidth="1.5">
        <circle cx="10" cy="10" r="7.5" />
        <path d="M10 2.5a7.5 7.5 0 0 1 0 15z" fill="currentColor" stroke="none" />
      </svg>
      <span className="text-sm font-medium">Appearance</span>
    </button>
  )
}
