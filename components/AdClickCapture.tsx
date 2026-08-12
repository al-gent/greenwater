'use client'

import { useEffect } from 'react'
import { captureAdClick } from '@/lib/ad-attribution'

/** Persists Google Ads click IDs (?gclid=…) from the landing URL so a later
 *  signup can record which ad click brought the visitor. Renders nothing. */
export default function AdClickCapture() {
  useEffect(() => {
    captureAdClick()
  }, [])
  return null
}
