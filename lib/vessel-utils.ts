/**
 * Pure utility functions — safe to import from both client and server components.
 * No Node.js / fs usage here.
 */


export interface VesselDoc {
  url: string
  name: string
  description: string | null
  contentLength: number | null
}

/** Per-photo attribution + provenance; url matches an entry in photo_urls. */
export interface PhotoDetail {
  url: string
  credit?: string
  /** License/source page (e.g. Wikimedia Commons file page) — credit renders as a link when set. */
  source?: string | null
  /** Rights provenance of the image. */
  origin?: 'operator' | 'team' | 'institution' | 'public-domain' | 'wikimedia' | 'import' | 'unknown'
  /** Uploader email from the storage auth trail, or 'script' for service-role uploads. */
  uploaded_by?: string
  uploaded_at?: string
  /** Set when the uploader asserted they hold rights to the photo (upload-form checkbox). */
  rights_asserted_at?: string
}

export type OrganizationRole = 'owner' | 'operator' | 'affiliation'

export interface VesselOrganization {
  id: string
  name: string
  short_name: string | null
  /** Shown in compact places when set (NOAA, UNOLS); otherwise the full name. */
  display_name: string | null
  role: OrganizationRole
}

export interface Vessel {
  id: number
  /** Current organization links (vessel_organizations), attached by lib/vessels. */
  organizations?: VesselOrganization[]
  name: string
  status: string
  country: string | null
  affiliation: string | null
  operator_name: string | null
  length: number | null
  speed_cruise: number | null
  scientists: number | null
  main_activity: string | null
  year_built: number | null
  year_refit: number | null
  call_sign: string | null
  mmsi: string | null
  imo_number: string | null
  url_ship: string | null
  url_operator: string | null
  primary_latitude: string | null
  primary_longitude: string | null
  beam: number | null
  draft: number | null
  crew: number | null
  speed_max: number | null
  ice_breaking: string | null
  operating_area: string | null
  operating_area_geojson: GeoJSON.FeatureCollection | null
  endurance: string | null
  dpos: string | null
  // Vessel of opportunity (pleasure/fishing/working craft that can host
  // research) + optional estimated charter rate. null = not answered.
  vessel_of_opportunity: boolean | null
  daily_rate: number | null
  daily_rate_currency: string | null // ISO 4217
  port_name: string | null
  port_city: string | null
  port_state: string | null

  // Extended fields (backfilled from vessel_details JSONs)
  photo_urls: string[] | null
  photo_details: PhotoDetail[] | null
  doc_details: VesselDoc[] | null
  last_updated: string | null // human listing edits (legacy rows: source registry date)
  created_at: string | null // when the vessel entered our system (null = legacy import)

  // GFW identity + last known port (populated by getAllVessels join; null on getVesselById)
  vessel_id_gfw: string | null
  last_port_city: string | null
  last_port_state: string | null
  last_port_country: string | null
  last_port_lat: number | null
  last_port_lon: number | null
  last_port_date: string | null

  // Contact & metadata
  owner: string | null
  contact: string | null
  contact_email: string | null
  operator_add1: string | null
  operator_add2: string | null
  operator_add3: string | null
  phone: string | null
  fax: string | null
  email: string | null
  url_schedule: string | null
  nodc_code: string | null
  ism_cert: string | null
  unols: boolean | null
  euro: boolean | null

  // Physical specs
  hull_material: string | null
  officers: number | null
  gross_tons: number | null
  power_hp: number | null
  range: number | null

  // Facilities
  capacity_dry: number | null
  capacity_fuel: number | null
  area_wetlab: number | null
  area_drylab: number | null
  water_gen: number | null
  water_capacity: number | null
  water_clean: string | null
  freeboard_deck: number | null
  free_deck_area: number | null
  space_cont_lab: string | null
  air_cond: number | null
  operating_grids: string | null

  // Power & propulsion
  engine_number: number | null
  engine_make: string | null
  engine_power: string | null
  prop_diam: number | null
  prop_maxrpm: number | null
  aux_diesel_pwr: number | null

  // Electrical
  ac_voltage: string | null
  ac_voltage_kva: string | null
  ac_voltage_phases: string | null
  ac_voltage_freq: string | null
  ac_voltage_stabilized: string | null
  ac_amps_stabilized: string | null
  ac_freq_stabilized: string | null
  dc_voltages: string | null
  dc_voltage_max: string | null

  // Navigation & comms
  nav_equipment: string | null
  nav_communications: string | null
  nav_satcomm: string | null
  nav_gps: string | null

  // Acoustics
  acoustic_echosound: string | null
  acoustic_sonar: string | null
  acoustic_silent: string | null

  // Oceanographic winches
  oc_winches: number | null
  oc_steelwire_len: number | null
  oc_steelwire_load: number | null
  oc_condcable_len: number | null
  oc_condcable_load: number | null
  oc_trawl_len: number | null
  oc_trawl_load: number | null
  oc_other_len: number | null
  oc_other_load: number | null

  // Cranes & gantries
  gantry_pos: string | null
  gantry_abovedeck: number | null
  gantry_outboard_ext: number | null
  gantry_load: number | null
  crane_pos: string | null
  crane_abovedeck: number | null
  crane_outboard_ext: number | null
  crane_load: number | null
  winch_other: string | null

  // Data processing
  dp_equip: string | null
  dp_equip_printing: string | null

  // Science equipment
  radioactive: string | null
  core_capable: string | null
  core_grab: string | null
  core_box: string | null
  core_gravity: string | null
  core_piston: string | null
  core_multi: string | null
  ctd_cap: string | null
  ctd_make: string | null
  ctd_towed: string | null
  ctd_oxy: string | null
  ctd_trans: string | null
  ctd_fluor: string | null
  ctd_rosette: string | null
  aquis_sms: string | null
  aquis_multibeam: string | null
  aquis_sidescan: string | null
  aquis_adcp: string | null
  underwater_vehicles: string | null
  underwater_vehicles_rov: string | null
  underwater_vehicles_auv: string | null
  underwater_vehicles_sub: string | null
  diving_cap: string | null

  // Classification & notes
  vessel_construct: string | null
  vessel_class: string | null
  vessel_other: string | null
  notes: string | null
  amenities: string | null
}

export interface FilterState {
  country: string
  activity: string
  minScientists: number
}

/** Strip HTML tags and decode basic entities */
// Matching key for organization names, mirroring public.org_key() in SQL:
// case, punctuation, and legal suffixes ignored.
const ORG_SUFFIXES = /\b(inc|incorporated|llc|ltd|limited|corp|corporation|co|gmbh|plc|pty)\b\.?/gi
export function orgKey(name: string): string {
  return name.toLowerCase().replace(ORG_SUFFIXES, ' ').replace(/[^\p{L}\p{N}]/gu, '')
}

/** True when the query key starts at a word boundary of the name ("brooks" hits "TDI-Brooks", "tdi" doesn't hit "Fleet Division"). */
export function orgNameMatches(name: string, queryKey: string): boolean {
  const words = name.toLowerCase().replace(ORG_SUFFIXES, ' ').split(/[^\p{L}\p{N}]+/u).filter(Boolean)
  return words.some((_, i) => words.slice(i).join('').startsWith(queryKey))
}

type DatedLink = { starts_on: string | null; ends_on: string | null }
export function isCurrentLink(link: DatedLink, today = new Date().toISOString().slice(0, 10)): boolean {
  return (!link.starts_on || link.starts_on <= today) && (!link.ends_on || link.ends_on >= today)
}

const uniqueOrgs = (list: VesselOrganization[]) => list.filter((o, i) => list.findIndex(x => x.id === o.id) === i)

/** The institutions running a vessel: its operators, or its owners when no operator is recorded. */
export function vesselInstitutions(v: Pick<Vessel, 'organizations'>): VesselOrganization[] {
  const links = v.organizations ?? []
  const operators = links.filter(o => o.role === 'operator')
  return uniqueOrgs(operators.length ? operators : links.filter(o => o.role === 'owner'))
}

/** Networks and programs the vessel belongs to (UNOLS, GLASS…), minus its institutions. */
export function vesselAffiliations(v: Pick<Vessel, 'organizations'>): VesselOrganization[] {
  const institutions = new Set(vesselInstitutions(v).map(o => o.id))
  return uniqueOrgs((v.organizations ?? []).filter(o => o.role === 'affiliation' && !institutions.has(o.id)))
}

/** One organization for compact displays (cards, lists): institution first, else an affiliation. */
export function primaryOrganization(v: Pick<Vessel, 'organizations'>): VesselOrganization | null {
  return vesselInstitutions(v)[0] ?? vesselAffiliations(v)[0] ?? null
}

/**
 * Directory organization search: returns, per vessel, the linked organizations
 * that match (empty = no match). A query that names an organization exactly
 * (name, acronym, or display name) matches only that organization, so
 * "Marine Institute" isn't also Memorial's; anything else matches at word starts.
 */
export function organizationMatcher(vessels: Pick<Vessel, 'organizations'>[], query: string): ((v: Pick<Vessel, 'organizations'>) => VesselOrganization[]) | null {
  const q = orgKey(query)
  if (!q) return null
  const namesOf = (o: VesselOrganization) => [o.name, o.short_name, o.display_name].filter((n): n is string => !!n)
  const exact = new Set<string>()
  for (const v of vessels) for (const o of v.organizations ?? []) if (namesOf(o).map(orgKey).includes(q)) exact.add(o.id)
  const hit = exact.size ? (o: VesselOrganization) => exact.has(o.id) : (o: VesselOrganization) => namesOf(o).some(n => orgNameMatches(n, q))
  return v => (v.organizations ?? []).filter(hit)
}

export const ROLE_PHRASE: Record<OrganizationRole, string> = { operator: 'operated by', owner: 'owned by', affiliation: 'affiliated with' }

/** Why a vessel matched an organization search, when its card wouldn't otherwise show it. */
export function organizationMatchReason(v: Pick<Vessel, 'organizations'>, matched: VesselOrganization[]): VesselOrganization | null {
  const shown = primaryOrganization(v)
  if (!matched.length || matched.some(m => m.id === shown?.id)) return null
  const order: OrganizationRole[] = ['operator', 'owner', 'affiliation']
  return [...matched].sort((a, b) => order.indexOf(a.role) - order.indexOf(b.role))[0]
}

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

/** Title-case a string (handles ALL-CAPS GFW port names) */
export function toTitleCase(s: string): string {
  return s.toLowerCase().replace(/\b\w/g, (c) => c.toUpperCase())
}

// ISO 3166-1 alpha-3 → alpha-2 for the vessel flag codes GFW returns.
// Covers the countries most likely to appear in the fleet; unknown codes return null.
const ALPHA3_TO_ALPHA2: Record<string, string> = {
  ABW:'AW',AFG:'AF',AGO:'AO',ALB:'AL',AND:'AD',ARE:'AE',ARG:'AR',ARM:'AM',ATG:'AG',
  AUS:'AU',AUT:'AT',AZE:'AZ',BDI:'BI',BEL:'BE',BEN:'BJ',BFA:'BF',BGD:'BD',BGR:'BG',
  BHR:'BH',BHS:'BS',BIH:'BA',BLR:'BY',BLZ:'BZ',BMU:'BM',BOL:'BO',BRA:'BR',BRB:'BB',
  BRN:'BN',BTN:'BT',BWA:'BW',CAF:'CF',CAN:'CA',CHE:'CH',CHL:'CL',CHN:'CN',CIV:'CI',
  CMR:'CM',COD:'CD',COG:'CG',COL:'CO',COM:'KM',CPV:'CV',CRI:'CR',CUB:'CU',CYP:'CY',
  CZE:'CZ',DEU:'DE',DJI:'DJ',DMA:'DM',DNK:'DK',DOM:'DO',DZA:'DZ',ECU:'EC',EGY:'EG',
  ERI:'ER',ESP:'ES',EST:'EE',ETH:'ET',FIN:'FI',FJI:'FJ',FRA:'FR',FSM:'FM',GAB:'GA',
  GBR:'GB',GEO:'GE',GHA:'GH',GIN:'GN',GMB:'GM',GNB:'GW',GNQ:'GQ',GRC:'GR',GRD:'GD',
  GTM:'GT',GUM:'GU',GUY:'GY',HND:'HN',HRV:'HR',HTI:'HT',HUN:'HU',IDN:'ID',IND:'IN',IRL:'IE',
  IRN:'IR',IRQ:'IQ',ISL:'IS',ISR:'IL',ITA:'IT',JAM:'JM',JOR:'JO',JPN:'JP',KAZ:'KZ',
  KEN:'KE',KGZ:'KG',KHM:'KH',KIR:'KI',KNA:'KN',KOR:'KR',KWT:'KW',LAO:'LA',LBN:'LB',
  LBR:'LR',LBY:'LY',LCA:'LC',LIE:'LI',LKA:'LK',LSO:'LS',LTU:'LT',LUX:'LU',LVA:'LV',
  MAR:'MA',MDA:'MD',MDG:'MG',MDV:'MV',MEX:'MX',MHL:'MH',MKD:'MK',MLI:'ML',MLT:'MT',
  MMR:'MM',MNE:'ME',MNG:'MN',MOZ:'MZ',MRT:'MR',MUS:'MU',MWI:'MW',MYS:'MY',NAM:'NA',
  NER:'NE',NGA:'NG',NIC:'NI',NLD:'NL',NOR:'NO',NPL:'NP',NRU:'NR',NZL:'NZ',OMN:'OM',
  PAK:'PK',PAN:'PA',PER:'PE',PHL:'PH',PLW:'PW',PNG:'PG',POL:'PL',PRK:'KP',PRT:'PT',
  PRY:'PY',PSE:'PS',PYF:'PF',QAT:'QA',ROU:'RO',RUS:'RU',RWA:'RW',SAU:'SA',SDN:'SD',
  SEN:'SN',SGP:'SG',SLB:'SB',SLE:'SL',SLV:'SV',SMR:'SM',SOM:'SO',SRB:'RS',STP:'ST',
  SUR:'SR',SVK:'SK',SVN:'SI',SWE:'SE',SWZ:'SZ',SYC:'SC',SYR:'SY',TCD:'TD',TGO:'TG',
  THA:'TH',TJK:'TJ',TKM:'TM',TLS:'TL',TON:'TO',TTO:'TT',TUN:'TN',TUR:'TR',TUV:'TV',
  TWN:'TW',TZA:'TZ',UGA:'UG',UKR:'UA',URY:'UY',USA:'US',UZB:'UZ',VCT:'VC',VEN:'VE',
  VNM:'VN',VUT:'VU',WSM:'WS',YEM:'YE',ZAF:'ZA',ZMB:'ZM',ZWE:'ZW',
  // Territories that appear as GFW port/anchorage flags
  ATA:'AQ',COK:'CK',CUW:'CW',CYM:'KY',FRO:'FO',GIB:'GI',GRL:'GL',HKG:'HK',
  MAC:'MO',NCL:'NC',REU:'RE',SJM:'SJ',VIR:'VI',
}

/** Convert an ISO 3166-1 alpha-3 code (e.g. "USA") to a flag emoji (e.g. "🇺🇸"). */
export function iso3ToFlag(alpha3: string | null | undefined): string | null {
  if (!alpha3) return null
  const a2 = ALPHA3_TO_ALPHA2[alpha3.toUpperCase()]
  if (!a2) return null
  return [...a2.toUpperCase()].map(c => String.fromCodePoint(0x1F1E6 + c.charCodeAt(0) - 65)).join('')
}

const COUNTRY_NAME_TO_ALPHA2: Record<string, string> = {
  // Common abbreviations / alternate spellings actually present in the DB
  'usa': 'US', 'uk': 'GB', 'korea': 'KR',
  // Full names
  'united states': 'US', 'united kingdom': 'GB', 'south korea': 'KR',
  'canada': 'CA', 'germany': 'DE', 'france': 'FR', 'norway': 'NO',
  'australia': 'AU', 'new zealand': 'NZ', 'russia': 'RU', 'japan': 'JP',
  'china': 'CN', 'spain': 'ES', 'italy': 'IT', 'netherlands': 'NL',
  'sweden': 'SE', 'denmark': 'DK', 'finland': 'FI', 'portugal': 'PT',
  'brazil': 'BR', 'india': 'IN', 'south africa': 'ZA', 'argentina': 'AR',
  'chile': 'CL', 'mexico': 'MX', 'taiwan': 'TW', 'singapore': 'SG',
  'indonesia': 'ID', 'philippines': 'PH', 'thailand': 'TH',
  'belgium': 'BE', 'bulgaria': 'BG', 'croatia': 'HR', 'ecuador': 'EC',
  'greece': 'GR', 'greenland': 'GL', 'iceland': 'IS', 'ireland': 'IE',
  'israel': 'IL', 'kenya': 'KE', 'libya': 'LY', 'monaco': 'MC',
  'pakistan': 'PK', 'panama': 'PA', 'peru': 'PE', 'poland': 'PL',
  'romania': 'RO', 'saudi arabia': 'SA', 'turkey': 'TR', 'ukraine': 'UA',
  'united arab emirates': 'AE', 'uruguay': 'UY', 'vanuatu': 'VU',
  'faroe islands': 'FO', 'cook islands': 'CK', 'cayman islands': 'KY',
}

/** Convert a full country name (e.g. "United States") to a flag emoji (e.g. "🇺🇸"). */
export function countryNameToFlag(name: string | null | undefined): string | null {
  if (!name) return null
  const a2 = COUNTRY_NAME_TO_ALPHA2[name.toLowerCase().trim()]
  if (!a2) return null
  return [...a2].map(c => String.fromCodePoint(0x1F1E6 + c.charCodeAt(0) - 65)).join('')
}

/**
 * Next src to try after an <img> error: a failed thumbnail falls back to the
 * original photo (thumbs are generated async — see .github/workflows), and a
 * failed original falls back to the placeholder.
 */
export function nextPhotoFallback(current: string, vessel: Vessel): string {
  const placeholder = getFallbackPhotoUrl(vessel)
  // Terminal state — if even the placeholder errors (storage down), returning
  // the same src stops the onError → setState → retry loop.
  if (current === placeholder) return placeholder
  const original = vessel.photo_urls?.[0]
  if (current.includes('/thumbs/') && original && current !== original) return original
  return placeholder
}

/** "2026-02-14…" → "today" / "5d ago" / "5mo ago" / "2yr ago" (null when no date) */
export function portAgeLabel(iso: string | null | undefined): string | null {
  if (!iso) return null
  const days = Math.floor((Date.now() - new Date(iso).getTime()) / 86400000)
  if (isNaN(days) || days < 0) return null
  if (days < 1) return 'today'
  if (days < 30) return `${days}d ago`
  if (days < 365) return `${Math.floor(days / 30)}mo ago`
  return `${Math.floor(days / 365)}yr ago`
}

/** Display helper — returns value or em dash */
export function fmt(value: string | number | null | undefined, suffix = ''): string {
  if (value === null || value === undefined || value === '') return '—'
  return `${value}${suffix}`
}

/** Currencies offered for the daily-rate dropdown (ISO 4217). */
export const RATE_CURRENCIES = [
  'USD', 'EUR', 'GBP', 'CAD', 'AUD', 'NZD', 'JPY', 'NOK', 'SEK', 'DKK',
  'ISK', 'CHF', 'BRL', 'CLP', 'MXN', 'ZAR', 'INR', 'IDR', 'SGD', 'KRW',
  'PLN', 'TRY',
] as const

/** "2500" + "EUR" → "€2,500" (falls back to "2,500 XYZ" for unknown codes). */
export function fmtDailyRate(rate: number | null | undefined, currency: string | null | undefined): string | null {
  if (rate == null) return null
  const code = (currency ?? 'USD').toUpperCase()
  try {
    return new Intl.NumberFormat('en-US', {
      style: 'currency', currency: code, maximumFractionDigits: 0,
    }).format(rate)
  } catch {
    return `${rate.toLocaleString()} ${code}`
  }
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
 * Returns the first URL from photo_urls, falling back to placeholder.
 */
export function getPhotoUrl(vessel: Vessel): string {
  if (vessel.photo_urls?.length) return toThumbUrl(vessel.photo_urls[0])
  return getFallbackPhotoUrl(vessel)
}

// "Featured" = complete enough to render a rich card with no blanks. The required
// fields ARE the fields the featured card shows (see VesselFeaturedCard).
export function isFeaturedVessel(v: Vessel): boolean {
  return (
    (v.photo_urls?.length ?? 0) > 0 &&
    v.length != null &&
    v.scientists != null &&
    v.draft != null &&
    !!(v.endurance ?? '').trim() &&
    !!(v.last_port_city || v.port_city) &&
    !!primaryOrganization(v) &&
    !!stripHtml(v.main_activity ?? '').trim()
  )
}

/** Fallback photo URL */
export function getFallbackPhotoUrl(_vessel: Vessel): string {
  return 'https://jmpxcsihkmyotidxjuyv.supabase.co/storage/v1/object/public/vessel-photos/thumbs/placeholder.jpg'
}

// Rewrites a Supabase Storage URL for a photo to point at the pre-generated
// ~400px-wide thumb in vessel-photos/thumbs/. Non-Supabase URLs pass through.
// See scripts/generate_thumbnails.py for the source-side resize job.
function toThumbUrl(url: string): string {
  const marker = '/storage/v1/object/public/vessel-photos/'
  const idx = url.indexOf(marker)
  if (idx === -1) return url
  const after = url.slice(idx + marker.length)
  if (after.startsWith('thumbs/')) return url
  return url.slice(0, idx + marker.length) + 'thumbs/' + after
}

export function filterVessels(vessels: Vessel[], filters: FilterState): Vessel[] {
  return vessels.filter((v) => {
    if (filters.country && v.country?.trim() !== filters.country) return false
    if (filters.activity) {
      const cleaned = stripHtml(v.main_activity)
      if (cleaned !== filters.activity) return false
    }
    if (filters.minScientists > 0) {
      if (!v.scientists || v.scientists < filters.minScientists) return false
    }
    return true
  })
}

// CARTO raster basemap (Voyager). Keyless requests still work but are
// watermarked "API KEY REQUIRED"; free key from carto.com/basemaps/apikey.
const cartoKey = process.env.NEXT_PUBLIC_CARTO_BASEMAPS_KEY
const tilePath = `{z}/{x}/{y}{r}.png${cartoKey ? `?key=${cartoKey}` : ''}`
export const CARTO_TILE_URL = `https://{s}.basemaps.cartocdn.com/rastertiles/voyager/${tilePath}`
export const CARTO_DARK_TILE_URL = `https://{s}.basemaps.cartocdn.com/dark_all/${tilePath}`
export const CARTO_ATTRIBUTION =
  '&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a> contributors &copy; <a href="https://carto.com/attributions">CARTO</a>'
