'use client'

import Script from 'next/script'
import { GOOGLE_ADS_ID } from '@/lib/gtag'

/**
 * Loads gtag.js for the Ad Grants account. Conversions are reported from
 * lib/gtag.ts — see there for why the ids are env-driven.
 */
export default function GoogleAdsTag() {
  if (!GOOGLE_ADS_ID) return null

  return (
    <>
      <Script
        src={`https://www.googletagmanager.com/gtag/js?id=${GOOGLE_ADS_ID}`}
        strategy="afterInteractive"
      />
      <Script id="gtag-init" strategy="afterInteractive">
        {`window.dataLayer=window.dataLayer||[];function gtag(){dataLayer.push(arguments);}gtag('js',new Date());gtag('config','${GOOGLE_ADS_ID}');`}
      </Script>
    </>
  )
}
