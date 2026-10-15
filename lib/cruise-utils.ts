/**
 * Client-safe cruise types + pure helpers. Server loading lives in lib/cruises.ts.
 */

export interface CruiseLeg {
  id: string
  cruise_id: string
  seq: number
  depart_port: string
  depart_unlocode: string | null
  depart_lat: number | null
  depart_lon: number | null
  depart_at: string
  arrive_port: string
  arrive_unlocode: string | null
  arrive_lat: number | null
  arrive_lon: number | null
  arrive_at: string
  notes: string | null
}

export interface CruiseOrganization {
  id: string
  name: string
  short_name: string | null
  website: string | null
}

export interface CruiseVessel {
  id: number
  name: string
  photo_urls: string[] | null
  country: string | null
  operator_name: string | null
  scientists: number | null
  status: string | null
}

export interface Cruise {
  id: string
  slug: string
  organization_id: string
  vessel_id: number
  title: string
  cruise_code: string | null
  operating_area: string | null
  operating_area_geojson: GeoJSON.FeatureCollection | null
  mobilization_at: string | null
  departure_at: string
  arrival_at: string
  demobilization_at: string | null
  actual_departure_at: string | null
  actual_arrival_at: string | null
  science_party_size: number | null
  berths_total: number | null
  berths_open: number | null
  confirmed_at: string | null
  cancelled_at: string | null
  published_at: string | null
  source: 'vesselconnect' | 'unols_mfp'
  external_id: string | null
  external_refs: Record<string, any> | null
  raw: Record<string, any> | null
  created_at: string
  updated_at: string
}

/** The funded work aboard a cruise. One or more per cruise; what MFP calls a cruise. */
export interface CruiseProject {
  id: string
  cruise_id: string
  title: string
  reference: string | null
  funding_source: string | null
  requested_start_earliest: string | null
  requested_start_latest: string | null
  requested_science_days: number | null
  science_party_size: number | null
  summary: string | null
  source: 'vesselconnect' | 'unols_mfp'
  external_id: string | null
  external_refs: Record<string, any> | null
  raw: Record<string, any> | null
}

/** A gear line on a cruise: the label as written, with the type filled in when matched. */
export interface CruiseEquipmentLine {
  id: string
  label: string
  provided_by: 'ship' | 'pool' | 'science_party' | null
  quantity: number | null
  notes: string | null
  type: { name: string; category: string | null } | null
}

export const PROVIDED_BY_LABEL: Record<NonNullable<CruiseEquipmentLine['provided_by']>, string> = {
  ship: 'Ship fitted',
  pool: 'Pooled / portable',
  science_party: 'Science party brings',
}

/** A seat on a cruise: a role, optionally filled by a person, optionally for part of the cruise. */
export interface CruiseSeat {
  id: string
  name: string | null                       // as-entered fallback when no person record
  start_at: string | null
  end_at: string | null
  notes: string | null
  role: { slug: string; label: string } | null
  person: { id: string; name: string; affiliation: string | null; organization_id: string | null } | null
}

/** A project as it hangs off a cruise: its people and its gear requests, with the confirmed
 *  bid's answer on each line when there is one. */
export interface CruiseProjectDetail extends CruiseProject {
  people: { id: string; name: string; role: { slug: string; label: string } | null }[]
  gear: { id: string; label: string; quantity: number | null; notes: string | null; answer: 'provide' | 'support' | null }[]
}

export interface CruiseDetail extends Cruise {
  legs: CruiseLeg[]
  vessel: CruiseVessel | null
  organization: CruiseOrganization | null
  projects: CruiseProjectDetail[]
  equipment: CruiseEquipmentLine[]     // operator-confirmed lines on the cruise itself (bid-confirmed cruises)
  seats: CruiseSeat[]                  // crew seats; the science party lives on the projects
}

/** How many projects a cruise carries, from the importer-maintained summary (1 when unknown). */
export const projectCount = (c: { external_refs: Record<string, any> | null }) => Math.max(1, Number(c.external_refs?.project_count ?? 1))

// Lifecycle is flags, not a status column; this is the display label.
export type CruiseStage = 'cancelled' | 'completed' | 'underway' | 'confirmed' | 'scheduled' | 'tentative'

export function cruiseStage(c: Cruise, now = new Date()): CruiseStage {
  if (c.cancelled_at) return 'cancelled'
  if (c.actual_arrival_at || new Date(c.arrival_at) < now) return 'completed'
  if (c.actual_departure_at || new Date(c.departure_at) <= now) return 'underway'
  if (c.confirmed_at) return 'confirmed'
  // Imported MFP rows carry the derived ladder (firm / scheduled / tentative / hide).
  const derived = c.external_refs?.derived_status
  if (derived === 'tentative') return 'tentative'
  return 'scheduled'
}

export const STAGE_LABEL: Record<CruiseStage, string> = {
  cancelled: 'Cancelled',
  completed: 'Completed',
  underway: 'Underway',
  confirmed: 'Confirmed',
  scheduled: 'Scheduled',
  tentative: 'Tentative',
}

export const STAGE_CLASS: Record<CruiseStage, string> = {
  cancelled: 'bg-gray-100 text-gray-500 border-gray-200',
  completed: 'bg-gray-50 text-gray-500 border-gray-200',
  underway: 'bg-teal/10 text-teal border-teal/30',
  confirmed: 'bg-navy-50 text-navy border-navy/10',
  scheduled: 'bg-navy-50 text-navy border-navy/10',
  tentative: 'bg-amber-50 text-amber-700 border-amber-200',
}

const D: Intl.DateTimeFormatOptions = { month: 'short', day: 'numeric', year: 'numeric', timeZone: 'UTC' }
export const fmtDate = (iso: string | null | undefined) => (iso ? new Date(iso).toLocaleDateString('en-US', D) : null)

/** "Oct 23 – Nov 4, 2026" / "Dec 28, 2026 – Jan 9, 2027" */
export function fmtDateRange(startIso: string, endIso: string): string {
  const s = new Date(startIso), e = new Date(endIso)
  const sameYear = s.getUTCFullYear() === e.getUTCFullYear()
  const sameDay = s.toISOString().slice(0, 10) === e.toISOString().slice(0, 10)
  if (sameDay) return fmtDate(startIso)!
  const start = s.toLocaleDateString('en-US', sameYear ? { month: 'short', day: 'numeric', timeZone: 'UTC' } : D)
  return `${start} – ${fmtDate(endIso)}`
}

export function cruiseDays(startIso: string, endIso: string): number {
  return Math.max(1, Math.round((new Date(endIso).getTime() - new Date(startIso).getTime()) / 86_400_000))
}
