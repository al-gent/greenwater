/**
 * Google Ads conversion tracking.
 *
 * Ad Grants requires meaningful conversion tracking and at least one recorded
 * conversion per month, so these events are a program requirement, not just
 * reporting. Every id lives in an env var: the conversion labels are minted in
 * the Google Ads UI when a conversion action is created, and they change if an
 * action is recreated — keeping them out of the source means no redeploy.
 *
 * With NEXT_PUBLIC_GOOGLE_ADS_ID unset (local dev, previews) the tag never
 * loads and trackConversion() is a no-op.
 */

// Referenced statically so Next inlines them at build time.
export const GOOGLE_ADS_ID = process.env.NEXT_PUBLIC_GOOGLE_ADS_ID ?? ''

const LABELS = {
  signup: process.env.NEXT_PUBLIC_GADS_LABEL_SIGNUP,
  inquiry: process.env.NEXT_PUBLIC_GADS_LABEL_INQUIRY,
  listing: process.env.NEXT_PUBLIC_GADS_LABEL_LISTING,
  newsletter: process.env.NEXT_PUBLIC_GADS_LABEL_NEWSLETTER,
} as const

export type ConversionName = keyof typeof LABELS

declare global {
  interface Window {
    gtag?: (...args: unknown[]) => void
  }
}

/**
 * Report a completed conversion. Safe to call unconditionally — it exits
 * quietly when the tag is absent, the label is unconfigured, or an ad blocker
 * kept gtag.js from loading.
 */
export function trackConversion(name: ConversionName) {
  const label = LABELS[name]
  if (!GOOGLE_ADS_ID || !label) return
  if (typeof window === 'undefined' || !window.gtag) return

  window.gtag('event', 'conversion', { send_to: `${GOOGLE_ADS_ID}/${label}` })
}
