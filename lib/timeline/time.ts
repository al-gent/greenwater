/**
 * Zone-aware day math. Everything on the timeline is positioned in fractional days
 * measured from the window start, in the display zone. Instants stay instants; only the
 * projection onto the axis depends on the zone.
 */
export const DAY_MS = 86_400_000

const fmtCache = new Map<string, Intl.DateTimeFormat>()
function fmt(tz: string) {
  let f = fmtCache.get(tz)
  if (!f) {
    f = new Intl.DateTimeFormat('en-US', { timeZone: tz, year: 'numeric', month: 'numeric', day: 'numeric', hour: 'numeric', minute: 'numeric', second: 'numeric', hourCycle: 'h23' })
    fmtCache.set(tz, f)
  }
  return f
}

/** Calendar fields of an instant in a zone. */
export function zonedParts(instant: Date, tz: string) {
  const p: Record<string, number> = {}
  for (const part of fmt(tz).formatToParts(instant)) if (part.type !== 'literal') p[part.type] = +part.value
  return { y: p.year, m: p.month, d: p.day, h: p.hour % 24, min: p.minute, s: p.second }
}

/** Days since epoch of the zone's calendar day containing the instant (integer). */
export function dayIndex(instant: Date, tz: string): number {
  const { y, m, d } = zonedParts(instant, tz)
  return Date.UTC(y, m - 1, d) / DAY_MS
}

/** Fractional day position: day index plus the fraction of that local day elapsed. */
export function dayPosition(instant: Date, tz: string): number {
  const { y, m, d, h, min, s } = zonedParts(instant, tz)
  return Date.UTC(y, m - 1, d) / DAY_MS + (h * 3600 + min * 60 + s) / 86_400
}

/** 'YYYY-MM-DD' -> days since epoch (calendar arithmetic, zone-free). */
export function isoDateIndex(iso: string): number {
  const [y, m, d] = iso.slice(0, 10).split('-').map(Number)
  return Date.UTC(y, m - 1, d) / DAY_MS
}

/** Days since epoch -> Date at UTC midnight (for formatting month/day labels). */
export const indexToDate = (idx: number) => new Date(idx * DAY_MS)

/** Today's ISO date in a zone. */
export function todayIso(tz: string, now = new Date()): string {
  const { y, m, d } = zonedParts(now, tz)
  return `${y}-${String(m).padStart(2, '0')}-${String(d).padStart(2, '0')}`
}
