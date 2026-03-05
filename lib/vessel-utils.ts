/**
 * Pure utility functions — safe to import from both client and server components.
 * No Node.js / fs usage here.
 */

export interface VesselFile {
  id: number
  name: string
  ext: string
  fileType: string
  contentType: string
  description: string | null
  credit: string | null
}

export interface Vessel {
  id: number
  name: string
  country: string | null
  homeport: string | null
  Affiliation: string | null
  Operator_Name: string | null
  length: number | null
  Speed_Cruise: number | null
  scientists: number | null
  Main_Activity: string | null
  Year_Built: number | null
  Year_Refit: number | null
  Call_sign: string | null
  url_ship: string | null
  url_operator: string | null
  primaryLatitude: string | null
  primaryLongitude: string | null
  files: VesselFile[]
  beam: number | null
  draft: number | null
  crew: number | null
  Speed_Max: number | null
  Ice_breaking: string | null
  Operating_area: string | null
  Endurance: string | null
  DPos: string | null
  photo_url: string | null
}

export interface FilterState {
  country: string
  activity: string
  minScientists: number
}

/** Strip HTML tags and decode basic entities */
export function stripHtml(html: string | null | undefined): string {
  if (!html) return ''
  return html
    .replace(/<[^>]*>/g, ' ')
    .replace(/&amp;/g, '&')
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>')
    .replace(/&nbsp;/g, ' ')
    .replace(/&quot;/g, '"')
    .replace(/&#039;/g, "'")
    .replace(/\s+/g, ' ')
    .trim()
}

/** Display helper — returns value or em dash */
export function fmt(value: string | number | null | undefined, suffix = ''): string {
  if (value === null || value === undefined || value === '') return '—'
  return `${value}${suffix}`
}

/** Get the photo file for a vessel (shipPhoto type only) */
export function getShipPhoto(vessel: Vessel): VesselFile | null {
  return vessel.files?.find(
    (f) => f.contentType === 'shipPhoto' && f.fileType === 'image'
  ) ?? null
}

/**
 * Apply the same filename sanitization used by scripts/fetch_vessels.py.
 * Spaces and non-alphanumeric ASCII chars (except . _ -) become underscores.
 * Non-ASCII Unicode letters/chars are preserved as-is.
 */
export function safeFilename(name: string): string {
  // Match Python: c.isalnum() (Unicode letters + digits) or c in "._-"
  // \p{L} = Unicode letters, \p{N} = Unicode numbers (excludes symbols like ©)
  return name
    .split('')
    .map((c) => (/[\p{L}\p{N}._-]/u.test(c) ? c : '_'))
    .join('')
}

/**
 * Return the photo URL for a vessel.
 * Uses the Supabase Storage URL stored in photo_url, falling back to picsum.
 */
export function getPhotoUrl(vessel: Vessel): string {
  if (vessel.photo_url) return vessel.photo_url
  return getFallbackPhotoUrl(vessel)
}

/** Fallback photo URL (deterministic ocean placeholder) */
export function getFallbackPhotoUrl(vessel: Vessel): string {
  return `https://picsum.photos/seed/vessel${vessel.id}/800/600`
}

export function filterVessels(vessels: Vessel[], filters: FilterState): Vessel[] {
  return vessels.filter((v) => {
    if (filters.country && v.country?.trim() !== filters.country) return false
    if (filters.activity) {
      const cleaned = stripHtml(v.Main_Activity)
      if (cleaned !== filters.activity) return false
    }
    if (filters.minScientists > 0) {
      if (!v.scientists || v.scientists < filters.minScientists) return false
    }
    return true
  })
}
