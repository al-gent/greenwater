'use client'

// A horizontal row of cards with arrows. `startIndex` is the card the row opens on (the
// vessel page starts at the first upcoming project, so left is past and right is future).
// `onReachStart` is called when the user scrolls to the left edge; it returns how many
// cards it prepended, and the row keeps the user's place.
import { useEffect, useLayoutEffect, useRef, useState, type ReactNode } from 'react'

const GAP = 16

export default function CardRow({ children, startIndex = 0, cardWidth = 320, onReachStart }: {
  children: ReactNode[]; startIndex?: number; cardWidth?: number; onReachStart?: () => Promise<number>
}) {
  const box = useRef<HTMLDivElement>(null)
  const [edges, setEdges] = useState({ left: false, right: false })
  const pending = useRef(0)            // cards being prepended; scroll is corrected once they mount
  const count = children.length
  const prevCount = useRef(count)

  const update = () => {
    const el = box.current; if (!el) return
    setEdges({ left: el.scrollLeft > 4, right: el.scrollLeft + el.clientWidth < el.scrollWidth - 4 })
  }
  useEffect(() => {
    const el = box.current; if (!el) return
    el.scrollLeft = Math.max(0, startIndex * (cardWidth + GAP))
    update()
    const onScroll = () => {
      update()
      if (onReachStart && el.scrollLeft < cardWidth && pending.current === 0) {
        pending.current = -1
        onReachStart().then((n) => { pending.current = n > 0 ? n : 0 })
      }
    }
    el.addEventListener('scroll', onScroll, { passive: true })
    const ro = new ResizeObserver(update); ro.observe(el)
    return () => { el.removeEventListener('scroll', onScroll); ro.disconnect() }
  }, [startIndex, cardWidth, onReachStart]) // eslint-disable-line react-hooks/exhaustive-deps

  // Cards prepended: shift scroll so the same card stays under the cursor.
  useLayoutEffect(() => {
    const added = count - prevCount.current
    prevCount.current = count
    const el = box.current
    if (el && added > 0 && pending.current > 0) { el.scrollLeft += added * (cardWidth + GAP); pending.current = 0; update() }
  }, [count, cardWidth])

  const by = (dir: -1 | 1) => box.current?.scrollBy({ left: dir * Math.max(cardWidth, box.current.clientWidth - cardWidth), behavior: 'smooth' })
  const arrow = 'absolute top-1/2 -translate-y-1/2 z-20 w-9 h-9 rounded-full bg-white shadow-card border border-gray-200 flex items-center justify-center text-navy hover:border-navy/30 disabled:opacity-0 transition-opacity'
  return (
    <div className="relative -mx-2">
      <button type="button" aria-label="Earlier" disabled={!edges.left} onClick={() => by(-1)} className={`${arrow} left-0`}>
        <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}><path strokeLinecap="round" strokeLinejoin="round" d="M15 19l-7-7 7-7" /></svg>
      </button>
      <div ref={box} className="flex gap-4 overflow-x-auto px-2 py-2 snap-x snap-mandatory [scrollbar-width:none] [&::-webkit-scrollbar]:hidden">
        {children.map((c, i) => <div key={(c as any)?.key ?? i} className="snap-start shrink-0 flex" style={{ width: cardWidth }}>{c}</div>)}
      </div>
      <button type="button" aria-label="Later" disabled={!edges.right} onClick={() => by(1)} className={`${arrow} right-0`}>
        <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}><path strokeLinecap="round" strokeLinejoin="round" d="M9 5l7 7-7 7" /></svg>
      </button>
    </div>
  )
}
