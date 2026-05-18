'use client'

import { useState, useEffect } from 'react'
import Link from 'next/link'
import { useRouter } from 'next/navigation'
import { useVesselViewTracker } from '@/hooks/useVesselViewTracker'

// ── Config ───────────────────────────────────────────────────────────────────
// Set mode to 'gate' for a hard gate: blocking modal, no content without signup.
// Set mode to 'banner' for a soft nudge: dismissable bottom bar, content stays visible.
export const NUDGE_CONFIG = {
  mode: 'banner' as 'banner' | 'gate',
  threshold: 3,
}
// ─────────────────────────────────────────────────────────────────────────────

const DISMISS_KEY = 'gw_nudge_dismissed'

interface Props {
  vesselId: number
  isAuthenticated: boolean
}

export default function SignupNudge({ vesselId, isAuthenticated }: Props) {
  const router = useRouter()
  const { thresholdReached } = useVesselViewTracker(
    vesselId,
    isAuthenticated,
    NUDGE_CONFIG.threshold,
  )
  const [dismissed, setDismissed] = useState(false)
  // hydrated guards against SSR/client mismatch — sessionStorage only exists in the browser
  const [hydrated, setHydrated] = useState(false)

  useEffect(() => {
    setDismissed(sessionStorage.getItem(DISMISS_KEY) === '1')
    setHydrated(true)
  }, [])

  // Prevent background scroll when the gate is open
  useEffect(() => {
    if (NUDGE_CONFIG.mode !== 'gate') return
    const gateOpen = hydrated && !isAuthenticated && thresholdReached && !dismissed
    if (!gateOpen) return
    document.body.style.overflow = 'hidden'
    return () => {
      document.body.style.overflow = ''
    }
  }, [hydrated, isAuthenticated, thresholdReached, dismissed])

  function dismiss() {
    if (NUDGE_CONFIG.mode === 'gate') {
      // Hard gate: route home rather than dismiss-in-place, so they can't keep browsing
      router.push('/')
      return
    }
    try {
      sessionStorage.setItem(DISMISS_KEY, '1')
    } catch {}
    setDismissed(true)
  }

  if (!hydrated || isAuthenticated || !thresholdReached || dismissed) return null

  const nextPath = `/vessels/${vesselId}`
  const signupHref = `/auth/signup?next=${encodeURIComponent(nextPath)}`
  const signinHref = `/auth/signin?next=${encodeURIComponent(nextPath)}`

  if (NUDGE_CONFIG.mode === 'gate') {
    return (
      <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-navy/60 backdrop-blur-sm">
        <div className="bg-white rounded-2xl shadow-modal max-w-md w-full p-8 text-center">
          <div className="w-14 h-14 bg-teal-50 rounded-full flex items-center justify-center mx-auto mb-5">
            <svg
              className="w-7 h-7 text-teal"
              fill="none"
              viewBox="0 0 24 24"
              stroke="currentColor"
              strokeWidth={1.5}
            >
              <path
                strokeLinecap="round"
                strokeLinejoin="round"
                d="M3 12l2-2m0 0l7-7 7 7M5 10v10a1 1 0 001 1h3m10-11l2 2m-2-2v10a1 1 0 01-1 1h-3m-6 0a1 1 0 001-1v-4a1 1 0 011-1h2a1 1 0 011 1v4a1 1 0 001 1m-6 0h6"
              />
            </svg>
          </div>
          <h2 className="text-2xl font-bold text-navy mb-2">Join to keep exploring</h2>
          <p className="text-gray-500 text-sm mb-6 leading-relaxed max-w-xs mx-auto">
            You&apos;ve browsed {NUDGE_CONFIG.threshold} vessels. Create a free account to keep
            searching and connect with operators.
          </p>
          <Link
            href={signupHref}
            className="block w-full bg-teal text-white py-3 rounded-2xl font-semibold text-sm hover:bg-teal/90 transition-all mb-3"
          >
            Create free account
          </Link>
          <Link
            href={signinHref}
            className="block text-sm font-medium text-teal hover:underline mb-6"
          >
            Already have an account? Sign in
          </Link>
          <button
            onClick={dismiss}
            className="text-xs text-gray-400 hover:text-gray-500 transition-colors"
          >
            Maybe later
          </button>
        </div>
      </div>
    )
  }

  // Banner mode
  return (
    <div className="fixed bottom-0 inset-x-0 z-40 p-4 pointer-events-none">
      <div className="max-w-2xl mx-auto bg-navy text-white rounded-2xl shadow-modal px-5 py-4 flex items-center gap-4 pointer-events-auto">
        <div className="w-10 h-10 bg-white/10 rounded-xl flex items-center justify-center flex-shrink-0">
          <svg
            className="w-5 h-5 text-white"
            fill="none"
            viewBox="0 0 24 24"
            stroke="currentColor"
            strokeWidth={1.5}
          >
            <path
              strokeLinecap="round"
              strokeLinejoin="round"
              d="M17 20h5v-2a3 3 0 00-5.356-1.857M17 20H7m10 0v-2c0-.656-.126-1.283-.356-1.857M7 20H2v-2a3 3 0 015.356-1.857M7 20v-2c0-.656.126-1.283.356-1.857m0 0a5.002 5.002 0 019.288 0M15 7a3 3 0 11-6 0 3 3 0 016 0z"
            />
          </svg>
        </div>
        <div className="flex-1 min-w-0">
          <p className="font-semibold text-sm leading-tight">Enjoying the vessel directory?</p>
          <p className="text-white/70 text-xs mt-0.5 leading-snug">
            Create a free account to save vessels and contact operators.
          </p>
        </div>
        <div className="flex items-center gap-2 flex-shrink-0">
          <Link
            href={signupHref}
            className="bg-gold text-navy text-xs font-bold px-4 py-2 rounded-xl hover:opacity-90 transition-all whitespace-nowrap"
          >
            Sign up free
          </Link>
          <button
            onClick={dismiss}
            aria-label="Dismiss"
            className="w-8 h-8 flex items-center justify-center rounded-xl hover:bg-white/10 text-white/60 hover:text-white transition-all"
          >
            <svg
              className="w-4 h-4"
              fill="none"
              viewBox="0 0 24 24"
              stroke="currentColor"
              strokeWidth={2}
            >
              <path strokeLinecap="round" strokeLinejoin="round" d="M6 18L18 6M6 6l12 12" />
            </svg>
          </button>
        </div>
      </div>
    </div>
  )
}
