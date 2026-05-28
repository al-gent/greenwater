'use client'

import { useState } from 'react'

interface Props {
  title: string
}

export default function ShareButton({ title }: Props) {
  const [copied, setCopied] = useState(false)

  const handleClick = async () => {
    if (typeof window === 'undefined') return
    const url = window.location.href

    // Native share sheet (mobile) if available
    if (navigator.share) {
      try {
        await navigator.share({ title, url })
        return
      } catch {
        // user dismissed the share sheet — no-op
        return
      }
    }

    // Desktop fallback: copy to clipboard
    try {
      await navigator.clipboard.writeText(url)
      setCopied(true)
      setTimeout(() => setCopied(false), 2000)
    } catch {
      // clipboard blocked (e.g. insecure context) — silent
    }
  }

  return (
    <button
      onClick={handleClick}
      className="text-sm text-gray-400 hover:text-navy flex items-center gap-1.5 transition-colors"
    >
      <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M8.684 13.342C8.886 12.938 9 12.482 9 12c0-.482-.114-.938-.316-1.342m0 2.684a3 3 0 110-2.684m0 2.684l6.632 3.316m-6.632-6l6.632-3.316m0 0a3 3 0 105.367-2.684 3 3 0 00-5.367 2.684zm0 9.316a3 3 0 105.368 2.684 3 3 0 00-5.368-2.684z" />
      </svg>
      {copied ? 'Link copied' : 'Share'}
    </button>
  )
}
