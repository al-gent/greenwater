/**
 * Client-safe project types, constants and validators. Server loading lives in lib/projects.ts
 * (which imports the service-role client and must never reach the browser).
 */
export const FUNDING_STATUSES = ['funded', 'pending', 'proposed', 'unfunded'] as const
export type FundingStatus = (typeof FUNDING_STATUSES)[number]

export interface ProjectPerson {
  id?: string
  role_id: string
  name: string
  notes: string | null
  role?: { slug: string; label: string } | null
}

export function validatePeople(v: unknown): string | null {
  if (!Array.isArray(v) || v.length > 100) return 'People must be a list of up to 100'
  for (const r of v) {
    if (!r || typeof r.role_id !== 'string' || !r.role_id) return 'Each person needs a role'
    if (typeof r.name !== 'string' || !r.name.trim() || r.name.length > 200) return 'Each person needs a name'
  }
  return null
}

export interface ProjectGearLine {
  id?: string
  label: string
  equipment_type_id: string | null
  quantity: number | null
  notes: string | null
}

export interface Project {
  id: string
  slug: string
  cruise_id: string | null
  title: string
  summary: string | null
  area_label: string | null
  area_geojson: GeoJSON.FeatureCollection | null
  requested_start_earliest: string | null
  requested_start_latest: string | null
  requested_science_days: number | null
  dates_notes: string | null
  party_size: number | null
  funding_source: string | null
  funding_status: FundingStatus | null
  grant_number: string | null
  funding_notes: string | null
  source: 'vesselconnect' | 'unols_mfp'
  created_by: string | null
  published_at: string | null
  deleted_at: string | null
  created_at: string
  updated_at: string
}

export const PROJECT_COLS = 'id, slug, cruise_id, title, summary, area_label, area_geojson, requested_start_earliest, requested_start_latest, requested_science_days, dates_notes, party_size, funding_source, funding_status, grant_number, funding_notes, source, created_by, published_at, deleted_at, created_at, updated_at'

/** Fields the API accepts from the form, with validators. null clears a field. */
export const PROJECT_FIELDS: Record<string, (v: unknown) => string | null> = {
  title: (v) => (typeof v === 'string' && v.trim().length > 0 && v.length <= 200 ? null : 'Title is required (up to 200 characters)'),
  summary: (v) => (v === null || (typeof v === 'string' && v.length <= 10_000) ? null : 'Description is too long'),
  area_label: (v) => (v === null || (typeof v === 'string' && v.length <= 200) ? null : 'Area name is too long'),
  area_geojson: (v) => (v === null || (typeof v === 'object' && (v as any).type === 'FeatureCollection' && Array.isArray((v as any).features)) ? null : 'Area must be a GeoJSON FeatureCollection'),
  requested_start_earliest: (v) => (v === null || (typeof v === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(v)) ? null : 'Earliest start must be a date'),
  requested_start_latest: (v) => (v === null || (typeof v === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(v)) ? null : 'Latest start must be a date'),
  requested_science_days: (v) => (v === null || (typeof v === 'number' && v >= 0 && v <= 365) ? null : 'Science days must be 0–365'),
  dates_notes: (v) => (v === null || (typeof v === 'string' && v.length <= 2000) ? null : 'Date notes are too long'),
  party_size: (v) => (v === null || (Number.isInteger(v) && (v as number) >= 0 && (v as number) <= 500) ? null : 'Party size must be a whole number'),
  funding_source: (v) => (v === null || (typeof v === 'string' && v.length <= 200) ? null : 'Funding source is too long'),
  funding_status: (v) => (v === null || (FUNDING_STATUSES as readonly string[]).includes(v as string) ? null : 'Funding status must be funded, pending, proposed or unfunded'),
  grant_number: (v) => (v === null || (typeof v === 'string' && v.length <= 100) ? null : 'Grant number is too long'),
  funding_notes: (v) => (v === null || (typeof v === 'string' && v.length <= 2000) ? null : 'Funding notes are too long'),
}

export function validateGear(v: unknown): string | null {
  if (!Array.isArray(v) || v.length > 50) return 'Gear must be a list of up to 50 lines'
  for (const g of v) {
    if (!g || typeof g.label !== 'string' || !g.label.trim() || g.label.length > 200) return 'Each gear line needs a label'
    if (g.quantity != null && !(Number.isInteger(g.quantity) && g.quantity > 0 && g.quantity <= 999)) return 'Gear quantity must be a whole number'
    if (g.equipment_type_id != null && typeof g.equipment_type_id !== 'string') return 'Bad equipment type'
  }
  return null
}

export interface BidGearAnswer { project_gear_id: string; answer: 'provide' | 'support'; notes: string | null }

export interface ProjectBid {
  id: string
  project_id: string
  vessel_id: number
  proposed_departure_at: string
  proposed_arrival_at: string
  tz: string
  berths: number | null
  cost_amount: number | null
  cost_currency: string | null
  notes: string | null
  offered_at: string
  offered_by: string
  accepted_at: string | null
  confirmed_at: string | null
  declined_at: string | null
  withdrawn_at: string | null
  cruise_id: string | null
  vessel: { id: number; name: string; operator_name: string | null } | null
  gear: BidGearAnswer[]
}

export type BidState = 'offered' | 'accepted' | 'confirmed' | 'declined' | 'withdrawn'
export function bidState(b: Pick<ProjectBid, 'accepted_at' | 'confirmed_at' | 'declined_at' | 'withdrawn_at'>): BidState {
  if (b.confirmed_at) return 'confirmed'
  if (b.withdrawn_at) return 'withdrawn'
  if (b.declined_at) return 'declined'
  if (b.accepted_at) return 'accepted'
  return 'offered'
}
export const BID_STATE_LABEL: Record<BidState, string> = { offered: 'Offered', accepted: 'Accepted', confirmed: 'Confirmed', declined: 'Declined', withdrawn: 'Withdrawn' }
export const BID_STATE_CLASS: Record<BidState, string> = {
  offered: 'bg-navy-50 text-navy border-navy/10',
  accepted: 'bg-gold-50 text-gold-700 border-gold-200',
  confirmed: 'bg-teal/10 text-teal border-teal/30',
  declined: 'bg-gray-100 text-gray-500 border-gray-200',
  withdrawn: 'bg-gray-100 text-gray-500 border-gray-200',
}

/** 'Horsetooth Reservoir Bathymetry' -> 'horsetooth-reservoir-bathymetry' (same rule as the SQL slugify()). */
export const slugify = (input: string) => input.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-+|-+$/g, '').slice(0, 80)
export const isUuid = (s: string) => /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(s)

// ── bids: field validators shared by the create and update routes ──
export const BID_FIELDS: Record<string, (v: unknown) => string | null> = {
  vessel_id: (v) => (Number.isInteger(v) ? null : 'Pick a vessel'),
  proposed_departure_at: (v) => (typeof v === 'string' && !isNaN(Date.parse(v)) ? null : 'Departure must be a date and time'),
  proposed_arrival_at: (v) => (typeof v === 'string' && !isNaN(Date.parse(v)) ? null : 'Arrival must be a date and time'),
  tz: (v) => (typeof v === 'string' && v.length <= 64 ? null : 'Bad time zone'),
  berths: (v) => (v === null || (Number.isInteger(v) && (v as number) >= 0 && (v as number) <= 500) ? null : 'Berths must be a whole number'),
  cost_amount: (v) => (v === null || (typeof v === 'number' && v >= 0 && v < 1e9) ? null : 'Cost must be a number'),
  cost_currency: (v) => (v === null || (typeof v === 'string' && /^[A-Z]{3}$/.test(v)) ? null : 'Currency must be a 3-letter code'),
  notes: (v) => (v === null || (typeof v === 'string' && v.length <= 5000) ? null : 'Notes are too long'),
}

export function validateBidGear(v: unknown): string | null {
  if (!Array.isArray(v) || v.length > 100) return 'Gear answers must be a list'
  for (const g of v) {
    if (!g || typeof g.project_gear_id !== 'string') return 'Bad gear line'
    if (!['provide', 'support'].includes(g.answer)) return 'Gear answer must be provide or support'
  }
  return null
}

export function readBidBody(body: Record<string, unknown>) {
  const row: Record<string, unknown> = {}
  for (const [key, validate] of Object.entries(BID_FIELDS)) {
    if (!(key in body)) continue
    const problem = validate(body[key])
    if (problem) return { error: problem }
    row[key] = body[key]
  }
  if (row.proposed_departure_at && row.proposed_arrival_at && new Date(row.proposed_arrival_at as string) <= new Date(row.proposed_departure_at as string)) return { error: 'Arrival must be after departure' }
  if ('gear' in body) { const p = validateBidGear(body.gear); if (p) return { error: p } }
  return { row }
}

