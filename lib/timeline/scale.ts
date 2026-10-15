/**
 * Timeline scales: how wide a day is, and how much of the calendar one screen holds.
 * Windows are computed as calendar dates (YYYY-MM-DD) in the display zone; the component
 * turns them into pixels. Zone-free arithmetic on ISO dates via Date.UTC is exact here.
 */
export type TimelineScale = 'day' | 'week' | 'month' | 'year'
export const SCALES: TimelineScale[] = ['day', 'week', 'month', 'year']
export const isScale = (s: unknown): s is TimelineScale => typeof s === 'string' && (SCALES as string[]).includes(s)

export const SCALE_PX: Record<TimelineScale, number> = { day: 1728, week: 144, month: 36, year: 4 }
export const SCALE_LABEL: Record<TimelineScale, string> = { day: 'Day', week: 'Week', month: 'Month', year: 'Year' }

const DAY_MS = 86_400_000
const toIdx = (iso: string) => { const [y, m, d] = iso.slice(0, 10).split('-').map(Number); return Date.UTC(y, m - 1, d) / DAY_MS }
const toIso = (idx: number) => new Date(idx * DAY_MS).toISOString().slice(0, 10)
const ymd = (iso: string) => iso.slice(0, 10).split('-').map(Number) as [number, number, number]

/** [start, end) as ISO dates for the scale containing `at`. Weeks start Monday. */
export function scaleWindow(scale: TimelineScale, at: string): { start: string; end: string } {
  const [y, m, d] = ymd(at)
  switch (scale) {
    case 'day': return { start: toIso(toIdx(at)), end: toIso(toIdx(at) + 1) }
    case 'week': { const idx = toIdx(at); const dow = (new Date(idx * DAY_MS).getUTCDay() + 6) % 7; return { start: toIso(idx - dow), end: toIso(idx - dow + 7) } }
    case 'month': return { start: toIso(Date.UTC(y, m - 1, 1) / DAY_MS), end: toIso(Date.UTC(y, m, 1) / DAY_MS) }
    case 'year': return { start: toIso(Date.UTC(y, m - 1, 1) / DAY_MS), end: toIso(Date.UTC(y, m + 11, 1) / DAY_MS) }
  }
  void d
}

/** `at` moved by one unit of the scale in either direction. */
export function shiftAt(scale: TimelineScale, at: string, dir: -1 | 1): string {
  const [y, m, d] = ymd(at)
  switch (scale) {
    case 'day': return toIso(toIdx(at) + dir)
    case 'week': return toIso(toIdx(at) + 7 * dir)
    case 'month': return toIso(Date.UTC(y, m - 1 + dir, Math.min(d, 28)) / DAY_MS)
    case 'year': return toIso(Date.UTC(y, m - 1 + 12 * dir, Math.min(d, 28)) / DAY_MS)
  }
}

/** Human title for the window: "Thursday, Oct 8, 2026", "Oct 5 – 11, 2026", "October 2026", "Oct 2026 – Sep 2027". */
export function windowTitle(scale: TimelineScale, start: string, end: string): string {
  const s = new Date(start + 'T00:00:00Z'), e = new Date(toIso(toIdx(end) - 1) + 'T00:00:00Z')
  const f = (dt: Date, o: Intl.DateTimeFormatOptions) => dt.toLocaleDateString('en-US', { ...o, timeZone: 'UTC' })
  switch (scale) {
    case 'day': return f(s, { weekday: 'long', month: 'short', day: 'numeric', year: 'numeric' })
    case 'week': return s.getUTCMonth() === e.getUTCMonth()
      ? `${f(s, { month: 'short', day: 'numeric' })} – ${e.getUTCDate()}, ${e.getUTCFullYear()}`
      : `${f(s, { month: 'short', day: 'numeric' })} – ${f(e, { month: 'short', day: 'numeric', year: 'numeric' })}`
    case 'month': return f(s, { month: 'long', year: 'numeric' })
    case 'year': return `${f(s, { month: 'short', year: 'numeric' })} – ${f(e, { month: 'short', year: 'numeric' })}`
  }
}

/** Days rendered before/after `at` on first paint, and how many days each lazy-load adds. */
export const SCALE_SPAN: Record<TimelineScale, { back: number; ahead: number; chunk: number }> = {
  day:   { back: 3,   ahead: 6,   chunk: 7 },
  week:  { back: 21,  ahead: 42,  chunk: 28 },
  month: { back: 92,  ahead: 184, chunk: 92 },
  year:  { back: 365, ahead: 730, chunk: 183 },
}

/** First-paint span [start, end) as ISO dates: aligned to the scale's unit, then padded. */
export function initialSpan(scale: TimelineScale, at: string): { start: string; end: string } {
  const w = scaleWindow(scale, at)
  const { back, ahead } = SCALE_SPAN[scale]
  return { start: toIso(toIdx(w.start) - back), end: toIso(toIdx(w.start) + ahead) }
}
export const addDays = (iso: string, n: number) => toIso(toIdx(iso) + n)

export type TimelineDensity = 'compact' | 'comfortable' | 'spacious'
export const DENSITIES: TimelineDensity[] = ['compact', 'comfortable', 'spacious']
export const isDensity = (d: unknown): d is TimelineDensity => typeof d === 'string' && (DENSITIES as string[]).includes(d)
