/**
 * Resource timeline: resources as rows, time across the top, entries as bars.
 * Pure (no hooks), so it renders on the server and inside client components alike.
 * It draws the grid at full width; TimelineViewport provides the scroll container and
 * lazy-loads more of the calendar as you scroll. Knows nothing about cruises, vessels
 * or people; see lib/timeline/types.ts and RESOURCE_TIMELINE_PLAN.md.
 */
import Link from 'next/link'
import type { ResourceTimelineProps, TimelineEntry, TimelineResource } from '@/lib/timeline/types'
import { packLanes } from '@/lib/timeline/lanes'
import { dayIndex, dayPosition, isoDateIndex, indexToDate, todayIso } from '@/lib/timeline/time'

export type TimelineDensity = 'compact' | 'comfortable' | 'spacious'
// Bars fill the row: a 1px breath from the row borders, 2px between stacked lanes.
const DENSITY: Record<TimelineDensity, { laneH: number; laneGap: number; rowPad: number; text: string; clamp: string; subClamp: string }> = {
  compact:     { laneH: 30, laneGap: 2, rowPad: 1, text: 'text-[11px]', clamp: 'line-clamp-1', subClamp: 'line-clamp-1' },
  comfortable: { laneH: 44, laneGap: 2, rowPad: 1, text: 'text-xs',     clamp: 'line-clamp-2', subClamp: 'line-clamp-2' },
  spacious:    { laneH: 60, laneGap: 2, rowPad: 1, text: 'text-sm',     clamp: 'line-clamp-2', subClamp: 'line-clamp-2' },
}
const LABEL_COL = 'w-32 sm:w-56 shrink-0'

const DEFAULT_PALETTE: Record<string, string> = { default: 'bg-navy text-white' }
const BLOCK_CLASS = 'text-gray-500 border border-gray-200 bg-[repeating-linear-gradient(135deg,#e5e7eb_0_4px,#f3f4f6_4px_8px)]'

const MONTH = (d: Date, withYear: boolean) => d.toLocaleDateString('en-US', { month: 'short', ...(withYear ? { year: 'numeric' } : {}), timeZone: 'UTC' })

interface Placed { entry: TimelineEntry; left: number; width: number; clipL: boolean; clipR: boolean; lane: number }

function place(entries: TimelineEntry[], winStart: number, winEnd: number, px: number, tz: string): { placed: Placed[]; lanes: number } {
  const spans = entries.map((e) => {
    const s = e.allDay ? dayIndex(new Date(e.start), tz) : dayPosition(new Date(e.start), tz)
    const en = e.allDay ? dayIndex(new Date(e.end), tz) : dayPosition(new Date(e.end), tz)
    return { entry: e, start: s, end: Math.max(en, s + 1 / 24) }
  }).filter((s) => s.end > winStart && s.start < winEnd)
  // All-day spans share their last day for lane packing: a cruise that arrives on the day
  // the next one departs is a turnaround, not a double booking, and stays on one row.
  const { lanes, count } = packLanes(spans.map((s) => s.entry.allDay ? { ...s, end: Math.max(s.start + 1 / 24, s.end - 1) } : s))
  const placed = spans.map((s, i) => {
    const a = Math.max(s.start, winStart), b = Math.min(s.end, winEnd)
    return { entry: s.entry, left: (a - winStart) * px, width: Math.max(3, (b - a) * px), clipL: s.start < winStart, clipR: s.end > winEnd, lane: lanes[i] }
  })
  return { placed, lanes: count }
}

function Bar({ p, palette, d }: { p: Placed; palette: Record<string, string>; d: (typeof DENSITY)[TimelineDensity] }) {
  const e = p.entry
  const cls = e.kind === 'block' ? BLOCK_CLASS : (palette[e.status ?? 'default'] ?? palette.default ?? DEFAULT_PALETTE.default)
  const shape = `absolute flex items-center overflow-hidden ${d.text} font-medium leading-snug rounded ${p.clipL ? 'rounded-l-none' : ''} ${p.clipR ? 'rounded-r-none' : ''} ${cls}`
  const style = { left: p.left, width: p.width, top: d.rowPad + p.lane * (d.laneH + d.laneGap), height: d.laneH }
  const text = p.width >= 48 ? <span className={`px-1.5 ${d.clamp} break-words`}>{e.label}</span> : null
  if (e.href && e.kind !== 'block') {
    return <Link href={e.href} aria-label={e.label} data-entry-id={e.id} className={`${shape} hover:brightness-110 hover:z-10 focus-visible:outline focus-visible:outline-2 focus-visible:outline-gold`} style={style}>{text}</Link>
  }
  return <div aria-label={e.label} data-entry-id={e.id} className={shape} style={style}>{text}</div>
}

export default function ResourceTimeline({ resources, entries, window: win, timeZone = 'UTC', today, palette = DEFAULT_PALETTE, emptyRowText, density = 'comfortable' }: ResourceTimelineProps) {
  const d = DENSITY[density]
  const px = win.pxPerDay
  const winStart = isoDateIndex(win.start), winEnd = isoDateIndex(win.end)
  const trackW = (winEnd - winStart) * px
  const todayIdx = isoDateIndex(today ?? todayIso(timeZone))
  const todayX = todayIdx >= winStart && todayIdx < winEnd ? (todayIdx - winStart) * px : null
  const showDays = px >= 24
  const showHours = px >= 240
  const hourStep = px >= 1200 ? 1 : px >= 480 ? 2 : 3
  const nowX = showHours ? (dayPosition(new Date(), timeZone) - winStart) * px : null

  // Month segments across the window; alternate shading is one gradient string reused per row.
  const months: { left: number; width: number; label: string }[] = []
  {
    const first = indexToDate(winStart)
    let y = first.getUTCFullYear(), m = first.getUTCMonth()
    let idx = winStart
    while (idx < winEnd) {
      const next = Date.UTC(y, m + 1, 1) / 86_400_000
      const end = Math.min(next, winEnd)
      months.push({ left: (idx - winStart) * px, width: (end - idx) * px, label: MONTH(indexToDate(idx), m === 0) })
      idx = end; m++; if (m > 11) { m = 0; y++ }
    }
    // Year on the first month wide enough to carry a label, so the axis always anchors.
    const anchor = months.find((mo) => mo.width >= 40)
    if (anchor && !/\d{4}/.test(anchor.label)) anchor.label = MONTH(indexToDate(winStart + anchor.left / px), true)
  }
  const shading = `linear-gradient(to right, ${months.map((mo, i) => `${i % 2 ? 'rgba(27,58,107,0.045)' : 'transparent'} ${mo.left}px ${mo.left + mo.width}px`).join(', ')})`
  // Vertical gridlines once columns are wide enough to mean something: days at week/month
  // scale, hours (lighter) at day scale. Layered over the month shading in one background.
  // Month boundaries run down through every row at every scale.
  const monthLines = `linear-gradient(to right, ${months.filter((mo) => mo.left > 0).map((mo) => `transparent ${mo.left}px, rgba(27,58,107,0.22) ${mo.left}px ${mo.left + 1}px, transparent ${mo.left + 1}px`).join(', ') || 'transparent 0, transparent 0'})`
  const gridlines = [
    showHours ? `repeating-linear-gradient(to right, rgba(27,58,107,0.07) 0 1px, transparent 1px ${px / 24}px)` : null,
    showDays ? `repeating-linear-gradient(to right, rgba(27,58,107,0.16) 0 1px, transparent 1px ${px}px)` : null,
    monthLines,
    shading,
  ].filter(Boolean).join(', ')

  const byResource = new Map<string, TimelineEntry[]>()
  for (const e of entries) (byResource.get(e.resourceId) ?? byResource.set(e.resourceId, []).get(e.resourceId)!).push(e)

  const groups = new Map<string | undefined, TimelineResource[]>()
  for (const r of resources) (groups.get(r.group) ?? groups.set(r.group, []).get(r.group)!).push(r)
  const hasGroups = resources.some((r) => r.group)

  const axisH = showHours ? 74 : showDays ? 52 : 44

  return (
        <div style={{ width: `calc(${trackW}px + var(--label-w, 14rem))` }} className="[--label-w:8rem] sm:[--label-w:14rem]">
          {/* axis */}
          <div className="sticky top-0 z-20 flex bg-white/95 backdrop-blur border-b border-gray-200" style={{ height: axisH }}>
            <div className={`${LABEL_COL} sticky left-0 z-40 bg-white border-r border-gray-200`} />
            <div className="relative shrink-0 overflow-hidden" style={{ width: trackW, backgroundImage: shading }}>
              {months.map((mo, i) => (
                <div key={i} className="absolute top-0 h-[28px] flex items-center border-l border-gray-200/80 first:border-l-0" style={{ left: mo.left, width: mo.width }}>
                  {mo.width >= 40 && <span className="pl-1.5 text-[11px] font-semibold text-navy truncate">{mo.label}</span>}
                </div>
              ))}
              {showDays && Array.from({ length: winEnd - winStart }, (_, i) => {
                const d = indexToDate(winStart + i)
                const wk = d.getUTCDay() === 0 || d.getUTCDay() === 6
                return (
                  <div key={i} className={`absolute top-[30px] h-[22px] flex items-center ${showHours ? 'justify-start pl-1.5 font-semibold text-navy' : 'justify-center'} text-[10px] tabular-nums ${wk && !showHours ? 'text-gray-300' : showHours ? '' : 'text-gray-500'}`} style={{ left: i * px, width: px }}>
                    {px >= 120 ? d.toLocaleDateString('en-US', { weekday: 'short', month: 'short', day: 'numeric', timeZone: 'UTC' }) : px >= 36 ? `${['S', 'M', 'T', 'W', 'T', 'F', 'S'][d.getUTCDay()]} ${d.getUTCDate()}` : d.getUTCDate()}
                  </div>
                )
              })}
              {showHours && Array.from({ length: (winEnd - winStart) * 24 }, (_, i) => (
                <div key={i} className={`absolute top-[52px] h-[22px] border-l ${i % hourStep === 0 ? 'border-gray-200' : 'border-gray-100'} flex items-end pb-1 pl-1 text-[10px] tabular-nums text-gray-500`} style={{ left: i * (px / 24), width: px / 24 }}>
                  {i % hourStep === 0 ? `${((i % 24) % 12) || 12}${(i % 24) < 12 ? 'am' : 'pm'}` : ''}
                </div>
              ))}
              {nowX != null && nowX >= 0 && nowX <= trackW ? (
                <span className="absolute bottom-0 -translate-x-1/2 rounded-t-md bg-gold text-navy-800 text-[10px] font-semibold px-1.5 leading-4" style={{ left: Math.min(Math.max(nowX, 18), trackW - 18) }}>Now</span>
              ) : todayX != null && !showHours && (
                <span className="absolute bottom-0 -translate-x-1/2 rounded-t-md bg-gold text-navy-800 text-[10px] font-semibold px-1.5 leading-4" style={{ left: Math.min(Math.max(todayX + px / 2, 22), trackW - 22) }}>Today</span>
              )}
            </div>
          </div>

          {/* rows */}
          <div className="flex h-3" aria-hidden>
            <div className={`${LABEL_COL} sticky left-0 z-20 bg-white border-r border-gray-200`} />
            <div className="shrink-0" style={{ width: trackW, backgroundImage: gridlines }} />
          </div>
          {[...groups.entries()].map(([group, rows]) => (
            <div key={group ?? '_'}>
              {hasGroups && (
                <div className="flex h-7">
                  <div className={`${LABEL_COL} sticky left-0 z-20 bg-lightblue-50 border-r border-gray-200 flex items-center px-3 text-[11px] font-semibold text-navy-600 truncate`}>{group ?? 'Other'}</div>
                  <div className="shrink-0 bg-lightblue-50/70" style={{ width: trackW }} />
                </div>
              )}
              {rows.map((r) => {
                const { placed, lanes } = place(byResource.get(r.id) ?? [], winStart, winEnd, px, timeZone)
                const h = d.rowPad * 2 + lanes * d.laneH + (lanes - 1) * d.laneGap
                return (
                  <div key={r.id} className="flex border-b border-gray-200 group/row" style={{ height: h }}>
                    <div className={`${LABEL_COL} sticky left-0 z-20 bg-white group-hover/row:bg-gray-50 border-r border-gray-200 flex items-center px-3 min-w-0`}>
                      <div className="min-w-0">
                        {r.href
                          ? <Link href={r.href} className={`block ${density === 'compact' ? 'text-[13px]' : 'text-sm'} font-semibold text-navy leading-tight line-clamp-1 hover:text-teal`}>{r.label}</Link>
                          : <p className={`${density === 'compact' ? 'text-[13px]' : 'text-sm'} font-semibold text-navy leading-tight line-clamp-1`}>{r.label}</p>}
                        {r.sublabel && <p className={`hidden sm:block ${density === 'compact' ? 'text-[11px]' : 'text-xs'} text-gray-500 leading-snug ${d.subClamp}`}>{r.sublabel}</p>}
                      </div>
                    </div>
                    <div className="relative shrink-0 overflow-hidden group-hover/row:bg-gray-50/60" style={{ width: trackW, backgroundImage: gridlines }}>
                      {nowX != null && nowX >= 0 && nowX <= trackW
                        ? <div className="absolute inset-y-0 w-0.5 bg-gold/70" style={{ left: nowX - 1 }} />
                        : todayX != null && !showHours && <div className="absolute inset-y-0 w-0.5 bg-gold/70" style={{ left: todayX + px / 2 - 1 }} />}
                      {placed.length === 0 && emptyRowText && <span className="absolute left-2 top-1/2 -translate-y-1/2 text-[11px] text-gray-300">{emptyRowText}</span>}
                      {placed.map((p) => <Bar key={p.entry.id} p={p} palette={palette} d={d} />)}
                    </div>
                  </div>
                )
              })}
            </div>
          ))}
          {resources.length === 0 && <p className="p-8 text-sm text-gray-400 text-center">Nothing to show in this window.</p>}
          <div className="flex h-4" aria-hidden>
            <div className={`${LABEL_COL} sticky left-0 z-20 bg-white border-r border-gray-200`} />
            <div className="shrink-0" style={{ width: trackW, backgroundImage: gridlines }} />
          </div>
        </div>
  )
}
