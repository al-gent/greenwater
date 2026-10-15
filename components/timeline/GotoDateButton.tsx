'use client'

// A link that also tells any mounted TimelineViewport to scroll to `date` — so "Today"
// works even when the URL does not change.
import Link from 'next/link'
import { useRouter } from 'next/navigation'
import { GOTO_EVENT } from './TimelineViewport'

export default function GotoDateButton({ date, href, className, children }: { date: string; href?: string; className?: string; children: React.ReactNode }) {
  const router = useRouter()
  const go = () => window.dispatchEvent(new CustomEvent(GOTO_EVENT, { detail: { date } }))
  if (!href) return <button type="button" className={className} onClick={go}>{children}</button>
  return (
    <Link
      href={href}
      className={className}
      onClick={(e) => {
        e.preventDefault()
        go()
        if (window.location.pathname + window.location.search !== href) router.replace(href, { scroll: false })
      }}
    >
      {children}
    </Link>
  )
}
