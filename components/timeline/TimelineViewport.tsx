'use client'

/**
 * Scroll container for ResourceTimeline that lazy-loads the calendar sideways.
 * The server renders the first span; as you scroll within ~1.5 screens of either edge
 * this fetches the next chunk from `fetchUrl` and extends the span, keeping the view
 * where it was. Generic: it knows the entry shape only through `toTimeline`.
 */
import { useCallback, useEffect, useLayoutEffect, useMemo, useRef, useState } from 'react'
import ResourceTimeline from './ResourceTimeline'
import type { TimelineEntry, TimelineResource } from '@/lib/timeline/types'
import { isoDateIndex } from '@/lib/timeline/time'
import { addDays, initialSpan as spanAround, SCALE_PX, SCALE_SPAN, type TimelineScale } from '@/lib/timeline/scale'

export const GOTO_EVENT = 'timeline:goto'   // window.dispatchEvent(new CustomEvent(GOTO_EVENT, { detail: { date: 'YYYY-MM-DD' } }))

interface Props<Row> {
  scale: TimelineScale
  at: string                       // ISO date to start the view at
  span: { start: string; end: string }
  timeZone: string
  today: string
  initialRows: Row[]
  resources: TimelineResource[]    // fixed rows; the adapter may add more
  toTimeline: (rows: Row[], fixed: TimelineResource[]) => { resources: TimelineResource[]; entries: TimelineEntry[] }
  fetchUrl: (from: string, to: string) => string   // returns JSON { entries: Row[] }
  palette?: Record<string, string>
  emptyRowText?: string
  density?: 'compact' | 'comfortable' | 'spacious'
  renderCard?: (entry: TimelineEntry, close: () => void) => React.ReactNode   // hover card body
  pxPerDay?: number                // override the scale's pixel density (the vessel strip uses 12)
}

export default function TimelineViewport<Row extends { id: string }>({ scale, at, span: initialSpan, timeZone, today, initialRows, resources, toTimeline, fetchUrl, palette, emptyRowText, density, renderCard, pxPerDay }: Props<Row>) {
  const px = pxPerDay ?? SCALE_PX[scale]
  const chunk = SCALE_SPAN[scale].chunk
  const box = useRef<HTMLDivElement>(null)
  const [span, setSpan] = useState(initialSpan)
  const [rows, setRows] = useState<Map<string, Row>>(() => new Map(initialRows.map((r) => [r.id, r])))
  const loading = useRef<{ left: boolean; right: boolean }>({ left: false, right: false })
  const pendingShift = useRef(0)         // px added on the left, to restore scrollLeft after render
  const target = useRef<string | null>(at)   // a date to put at the left edge once it is rendered
  const generation = useRef(0)           // bumped on goto; an extend() from an older span is discarded

  const scrollToDate = useCallback((date: string, smooth = false) => {
    if (!box.current) return
    const left = (isoDateIndex(date) - isoDateIndex(span.start)) * px
    box.current.scrollTo({ left, behavior: smooth ? 'smooth' : 'auto' })
  }, [span.start, px])

  // Whenever `at` changes (navigation) put it at the left edge.
  useEffect(() => { target.current = at }, [at])

  // After any render: restore position after a prepend, then honour a pending target.
  useLayoutEffect(() => {
    if (!box.current) return
    if (pendingShift.current) { box.current.scrollLeft += pendingShift.current; pendingShift.current = 0 }
    if (target.current && target.current >= span.start && target.current < span.end) {
      scrollToDate(target.current)
      target.current = null
    }
  }, [span.start, span.end, at, scrollToDate])

  // "Today" and friends: jump to a date, loading its span first if it is out of reach.
  useEffect(() => {
    const onGoto = async (ev: Event) => {
      const date = (ev as CustomEvent<{ date: string }>).detail?.date
      if (!date) return
      if (date >= span.start && date < span.end) { scrollToDate(date, true); return }
      const next = spanAround(scale, date)
      const res = await fetch(fetchUrl(next.start, next.end))
      const data = res.ok ? await res.json() : { entries: [] }
      generation.current++
      loading.current = { left: false, right: false }
      setRows(new Map(((data.entries ?? []) as Row[]).map((r) => [r.id, r])))
      target.current = date
      setSpan(next)
    }
    window.addEventListener(GOTO_EVENT, onGoto)
    return () => window.removeEventListener(GOTO_EVENT, onGoto)
  }, [span.start, span.end, scale, fetchUrl, scrollToDate])

  const extend = useCallback(async (side: 'left' | 'right') => {
    if (loading.current[side]) return
    loading.current[side] = true
    // Grow by at least two screens so one load outruns the threshold that triggered it.
    const days = Math.max(chunk, Math.ceil((2 * (box.current?.clientWidth ?? 0)) / px))
    const from = side === 'left' ? addDays(span.start, -days) : span.end
    const to = side === 'left' ? span.start : addDays(span.end, days)
    const gen = generation.current
    try {
      const res = await fetch(fetchUrl(from, to))
      const data = res.ok ? await res.json() : { entries: [] }
      if (gen !== generation.current) return   // the span was replaced while this was in flight
      setRows((prev) => {
        const next = new Map(prev)
        for (const r of (data.entries ?? []) as Row[]) next.set(r.id, r)
        return next
      })
      if (side === 'left') pendingShift.current = days * px
      setSpan((s) => (side === 'left' ? { ...s, start: from } : { ...s, end: to }))
    } finally {
      loading.current[side] = false
    }
  }, [span.start, span.end, chunk, px, fetchUrl])

  const check = useCallback(() => {
    const el = box.current
    if (!el) return
    const ahead = 1.5 * el.clientWidth
    if (el.scrollLeft < ahead) extend('left')
    if (el.scrollWidth - el.scrollLeft - el.clientWidth < ahead) extend('right')
  }, [extend])

  useEffect(() => {
    const el = box.current
    if (!el) return
    let raf = 0
    const onScroll = () => { cancelAnimationFrame(raf); raf = requestAnimationFrame(check) }
    el.addEventListener('scroll', onScroll, { passive: true })
    window.addEventListener('resize', onScroll)
    return () => { el.removeEventListener('scroll', onScroll); window.removeEventListener('resize', onScroll); cancelAnimationFrame(raf) }
  }, [check])

  // After the span grows (or on first paint), see whether an edge is still within reach.
  useEffect(() => { const id = requestAnimationFrame(check); return () => cancelAnimationFrame(id) }, [span.start, span.end, check])

  const { resources: rs, entries } = useMemo(() => toTimeline([...rows.values()], resources), [rows, resources, toTimeline])

  // ── hover card: delegated from the bars (data-entry-id), positioned in viewport coords ──
  const [card, setCard] = useState<{ id: string; x: number; y: number; below: boolean } | null>(null)
  const closeTimer = useRef<number | null>(null)
  const cancelClose = () => { if (closeTimer.current) { window.clearTimeout(closeTimer.current); closeTimer.current = null } }
  const scheduleClose = () => { cancelClose(); closeTimer.current = window.setTimeout(() => setCard(null), 160) }
  const closeCard = useCallback(() => { cancelClose(); setCard(null) }, [])
  const onOver = (ev: React.MouseEvent) => {
    const bar = (ev.target as HTMLElement).closest<HTMLElement>('[data-entry-id]')
    if (!bar) return
    cancelClose()
    const r = bar.getBoundingClientRect()
    const below = r.bottom + 240 < window.innerHeight
    setCard({ id: bar.dataset.entryId!, x: Math.min(Math.max(ev.clientX, 170), window.innerWidth - 170), y: below ? r.bottom + 6 : r.top - 6, below })
  }
  const onOut = (ev: React.MouseEvent) => {
    if ((ev.target as HTMLElement).closest('[data-entry-id]')) scheduleClose()
  }
  useEffect(() => { if (card) { const el = box.current; const hide = () => setCard(null); el?.addEventListener('scroll', hide, { passive: true }); return () => el?.removeEventListener('scroll', hide) } }, [card])
  const cardEntry = card ? entries.find((e) => e.id === card.id) : null

  return (
    <div className="border border-gray-200 rounded-2xl overflow-hidden bg-white shadow-card">
      <div ref={box} className="overflow-auto max-h-[75vh] overscroll-x-contain" onMouseOver={renderCard ? onOver : undefined} onMouseOut={renderCard ? onOut : undefined}>
        <ResourceTimeline resources={rs} entries={entries} window={{ start: span.start, end: span.end, pxPerDay: px }} timeZone={timeZone} today={today} palette={palette} emptyRowText={emptyRowText} density={density} />
      </div>
      {renderCard && card && cardEntry && (
        // No transform here: a transformed ancestor becomes the containing block for the
        // fixed-position modal the card can open, which would trap it inside the card.
        <div
          className="fixed z-[150] w-[340px] max-w-[calc(100vw-2rem)]"
          style={card.below ? { left: card.x - 170, top: card.y } : { left: card.x - 170, bottom: window.innerHeight - card.y }}
          onMouseEnter={cancelClose}
          onMouseLeave={scheduleClose}
        >
          {renderCard(cardEntry, closeCard)}
        </div>
      )}
    </div>
  )
}
