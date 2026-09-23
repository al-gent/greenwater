// TEMPORARY — MFP data explorer. Reads the raw pulls in mfp-api/raw/ directly.
// Delete this folder before the feature ships.
import 'server-only'
import fs from 'fs'
import path from 'path'

const RAW = path.join(process.cwd(), 'mfp-api', 'raw')
const SME_CACHE = path.join(RAW, 'sme')

export type Cruise = any
export type GeoFC = any

let cruisesCache: Cruise[] | null = null
let geoCache: Map<string, GeoFC> | null = null

export function readCruises(): Cruise[] {
  if (!cruisesCache) {
    cruisesCache = JSON.parse(fs.readFileSync(path.join(RAW, 'cruises-decoded.json'), 'utf8'))
  }
  return cruisesCache!
}

export function readGeo(cruiseApplicationId: number | string): GeoFC | null {
  if (!geoCache) {
    const arr: GeoFC[] = JSON.parse(fs.readFileSync(path.join(RAW, 'Read_CruiseApplicationGEOJson.json'), 'utf8'))
    geoCache = new Map(arr.map((fc) => [String(fc.properties.CruiseApplication_id), fc]))
  }
  return geoCache.get(String(cruiseApplicationId)) ?? null
}

// ---- entity seed lists (built by the python in mfp-api; see README) ----
const entityCache = new Map<string, any>()
export function readEntity(name: 'people' | 'organizations' | 'equipment'): any {
  if (!entityCache.has(name)) entityCache.set(name, JSON.parse(fs.readFileSync(path.join(RAW, `${name}.json`), 'utf8')))
  return entityCache.get(name)
}

export function firstLegDeparture(c: Cruise): string | null {
  const d = c.Legs?.map((l: any) => l.Departure).filter(Boolean).sort()
  return d?.[0] ?? null
}

export function isUpcoming(c: Cruise, today = new Date()): boolean {
  return (c.Legs ?? []).some((l: any) => l.Departure && new Date(l.Departure) > today)
}

// Derived status ladder (see mfp-api/README.md).
export function derivedStatus(c: Cruise): { label: string; reasons: string[] } {
  const reasons: string[] = []
  const fs = new Set<string>((c.DestinationFundings ?? []).map((f: any) => f.StatusDisplay || '(blank)'))
  const ships = c.Ships?.length ?? 0
  const code = c.Workflow?.AlternateReferenceNumber
  if (c.Cruise?.Start?.ActualDeparture) return { label: 'Sailed', reasons: ['ActualDeparture is set'] }
  if (fs.has('Declined') || fs.has('Withdrawn') || fs.has('(blank)') || fs.size === 0) {
    reasons.push(`funding status: ${[...fs].join(', ') || 'none'}`)
    return { label: 'Hide (dead/placeholder)', reasons }
  }
  if (ships > 1) reasons.push(`${ships} ships listed (preference list)`)
  if (fs.has('Pending')) reasons.push('funding Pending')
  if (reasons.length) return { label: 'Tentative', reasons }
  if (ships === 1 && code) return { label: 'Firm', reasons: ['single ship', `cruise code ${code}`, 'Funded'] }
  if (ships === 1) return { label: 'Scheduled', reasons: ['single ship', 'Funded', 'no cruise code yet'] }
  return { label: 'Scheduled (no ship listed)', reasons: ['Ships[] empty; parked on ' + (c.Cruise?.Start?.Voyage?.FlexLocation?.Name ?? '?')] }
}

// ---- SME detail pane (live fetch from mfp.us, cached to disk) ----

export interface SmeRow { label: string; value: string }
export interface SmeSection { title: string; rows: SmeRow[] }

function stripTags(s: string): string {
  return s
    .replace(/<script[\s\S]*?<\/script>/g, '')
    .replace(/<style[\s\S]*?<\/style>/g, '')
    .replace(/<[^>]+>/g, ' ')
    .replace(/&nbsp;/g, ' ')
    .replace(/&amp;/g, '&')
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>')
    .replace(/&quot;/g, '"')
    .replace(/&#39;/g, "'")
    .replace(/\s+/g, ' ')
    .trim()
}

function rowValue(html: string): string {
  // Free-text answers are injected client-side via DOMPurify: const data = "…";
  const m = html.match(/const data = ("(?:[^"\\]|\\.)*")/)
  if (m) {
    try {
      return stripTags(JSON.parse(m[1]))
    } catch {
      /* fall through */
    }
  }
  return stripTags(html)
}

export function parseSme(html: string): SmeSection[] {
  const sections: SmeSection[] = []
  const parts = html.split(/<h4 class="summary-section-header">/)
  for (const part of parts.slice(1)) {
    const titleEnd = part.indexOf('</h4>')
    const title = stripTags(part.slice(0, titleEnd))
    const body = part.slice(titleEnd)
    const rows: SmeRow[] = []
    const rowRe = /<label class="data-row-label">([\s\S]*?)<\/label>\s*<(?:div|span) class="data-row-value[^"]*">([\s\S]*?)<\/(?:div|span)>\s*<\/div>/g
    let m: RegExpExecArray | null
    while ((m = rowRe.exec(body))) {
      const label = stripTags(m[1])
      const value = rowValue(m[2])
      if (label) rows.push({ label, value: value || '—' })
    }
    // Also capture subheaders as rows so section structure is visible
    const subRe = /<h5 class="summary-section-subheader">([\s\S]*?)<\/h5>/g
    const subs: string[] = []
    while ((m = subRe.exec(body))) subs.push(stripTags(m[1]))
    if (subs.length) rows.unshift({ label: '(subsections)', value: subs.join(' · ') })
    sections.push({ title, rows })
  }
  return sections
}

export async function fetchSme(voyageEventId: number, organisationId: number): Promise<{ html: string; cached: boolean } | { error: string }> {
  fs.mkdirSync(SME_CACHE, { recursive: true })
  const file = path.join(SME_CACHE, `${voyageEventId}_${organisationId}.html`)
  if (fs.existsSync(file)) return { html: fs.readFileSync(file, 'utf8'), cached: true }
  const url = `https://www.mfp.us/Programme/Cruise/${voyageEventId}?organisation_id=${organisationId}&tab=&caTab=&t=${Date.now()}`
  try {
    const res = await fetch(url, { headers: { 'User-Agent': 'Mozilla/5.0', 'X-Requested-With': 'XMLHttpRequest' }, cache: 'no-store' })
    const html = await res.text()
    if (!res.ok || html.startsWith('{')) return { error: `${res.status}: ${html.slice(0, 200)}` }
    fs.writeFileSync(file, html)
    return { html, cached: false }
  } catch (e: any) {
    return { error: String(e?.message ?? e) }
  }
}
