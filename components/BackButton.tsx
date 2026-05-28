'use client'

import { useRouter } from 'next/navigation'

interface Props {
  fallbackHref?: string
  label?: string
}

export default function BackButton({ fallbackHref = '/', label = 'Back' }: Props) {
  const router = useRouter()

  const handleClick = () => {
    if (typeof window !== 'undefined' && window.history.length > 1) {
      router.back()
    } else {
      router.push(fallbackHref)
    }
  }

  return (
    <button
      onClick={handleClick}
      className="flex items-center gap-1.5 text-sm text-gray-500 hover:text-navy transition-colors"
    >
      <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
        <path strokeLinecap="round" strokeLinejoin="round" d="M10 19l-7-7m0 0l7-7m-7 7h18" />
      </svg>
      {label}
    </button>
  )
}
