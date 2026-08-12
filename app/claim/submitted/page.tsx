import type { Metadata } from 'next'
import Link from 'next/link'

export const metadata: Metadata = {
  title: 'Claim Submitted — Greenwater Foundation',
}

export default function ClaimSubmittedPage({
  searchParams,
}: {
  searchParams: { vessel?: string }
}) {
  const vesselName = searchParams.vessel

  return (
    <div className="min-h-screen bg-gray-50 flex items-center justify-center px-4 pt-[112px] pb-12">
      <div className="w-full max-w-md text-center">
        <div className="w-16 h-16 bg-teal-50 rounded-full flex items-center justify-center mx-auto mb-4">
          <svg className="w-8 h-8 text-teal" fill="none" viewBox="0 0 24 24" stroke="currentColor">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 13l4 4L19 7" />
          </svg>
        </div>
        <h1 className="text-2xl font-bold text-navy mb-2">You&apos;re all set</h1>
        <p className="text-gray-500 mb-3">
          Your account is confirmed and your claim{vesselName ? <> for <strong>{vesselName}</strong></> : null} has
          been submitted to our team for review.
        </p>
        <p className="text-sm text-gray-400 mb-8">
          Most reviews take 3–5 business days. We&apos;ll email you as soon as it&apos;s approved.
        </p>
        <Link
          href="/"
          className="inline-block bg-navy text-white px-6 py-3 rounded-full font-medium hover:bg-navy-600 transition-colors"
        >
          Browse Vessels
        </Link>
      </div>
    </div>
  )
}
