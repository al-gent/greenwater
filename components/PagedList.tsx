'use client'

// Renders the first `pageSize` items and a Show more button; the server passes the rows already built.
import { useState, type ReactNode } from 'react'

export default function PagedList({ items, pageSize = 20, className, noun = 'items' }: { items: ReactNode[]; pageSize?: number; className?: string; noun?: string }) {
  const [shown, setShown] = useState(pageSize)
  return (
    <>
      <ul className={className}>{items.slice(0, shown)}</ul>
      {shown < items.length && (
        <div className="flex items-center justify-center gap-3 mt-3 text-xs text-gray-400">
          <span>{shown} of {items.length} {noun}</span>
          <button type="button" onClick={() => setShown((n) => n + pageSize)} className="px-3 py-1.5 rounded-lg border border-gray-200 text-xs font-medium text-navy hover:border-navy/30">Show more</button>
        </div>
      )}
    </>
  )
}
