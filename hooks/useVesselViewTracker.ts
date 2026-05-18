import { useEffect, useState } from 'react'

const LS_KEY = 'gw_viewed_vessels'

/**
 * Records unique vessel detail page views in localStorage and checks
 * whether the user has crossed the given threshold.
 *
 * Safe to call on every render — deduplication is handled internally.
 * No-ops entirely when the user is authenticated.
 */
export function useVesselViewTracker(
  vesselId: number,
  isAuthenticated: boolean,
  threshold: number,
) {
  const [uniqueViewCount, setUniqueViewCount] = useState(0)

  useEffect(() => {
    if (isAuthenticated) return

    try {
      const raw = localStorage.getItem(LS_KEY)
      const ids: number[] = raw ? JSON.parse(raw) : []
      const seen = new Set(ids)
      seen.add(vesselId)
      localStorage.setItem(LS_KEY, JSON.stringify([...seen]))
      setUniqueViewCount(seen.size)
    } catch {
      // Unavailable in private browsing or when storage is full — skip silently
    }
  }, [vesselId, isAuthenticated])

  return {
    uniqueViewCount,
    thresholdReached: uniqueViewCount >= threshold,
  }
}
