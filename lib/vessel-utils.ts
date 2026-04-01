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
  beam: number | null
  draft: number | null
  crew: number | null
  Speed_Max: number | null
  Ice_breaking: string | null
  Operating_area: string | null
  Endurance: string | null
  DPos: string | null
  photo_url: string | null
  port_city: string | null
  port_state: string | null

  // Extended fields (backfilled from vessel_details JSONs)
  photo_urls: string[] | null
  doc_details: VesselDoc[] | null
  last_updated: string | null

  // GFW identity + last known port (populated by getAllVessels join; null on getVesselById)
  vessel_id_gfw: string | null
  last_port_name: string | null
  last_port_flag: string | null
  last_port_lat: number | null
  last_port_lon: number | null
  last_port_date: string | null

  // Contact & metadata
  Owner: string | null
  Contact: string | null
  contact_email: string | null
  Operator_Add1: string | null
  Operator_Add2: string | null
  Operator_Add3: string | null
  phone: string | null
  fax: string | null
  email: string | null
  url_schedule: string | null
  NODC_Code: string | null
  ISM_Cert: string | null
  Unols: boolean | null
  Euro: boolean | null

  // Physical specs
  Hull_Material: string | null
  officers: number | null
  Gross_Tons: number | null
  Power_HP: number | null
  range: number | null

  // Facilities
  Capacity_dry: number | null
  Capacity_fuel: number | null
  Area_wetlab: number | null
  Area_drylab: number | null
  Water_gen: number | null
  Water_capacity: number | null
  Water_clean: string | null
  Freeboard_deck: number | null
  Free_deck_area: number | null
  Space_cont_lab: string | null
  Air_Cond: number | null
  Operating_grids: string | null

  // Power & propulsion
  Engine_number: number | null
  Engine_make: string | null
  Engine_power: string | null
  Prop_diam: number | null
  Prop_maxrpm: number | null
  Aux_Diesel_pwr: number | null

  // Electrical
  AC_Voltage: string | null
  AC_Voltage_kVA: string | null
  AC_Voltage_phases: string | null
  AC_Voltage_freq: string | null
  AC_Voltage_Stabilized: string | null
  AC_Amps_Stabilized: string | null
  AC_Freq_Stabilized: string | null
  DC_Voltages: string | null
  DC_Voltage_max: string | null

  // Navigation & comms
  Nav_Equipment: string | null
  Nav_Communications: string | null
  Nav_Satcomm: string | null
  Nav_GPS: string | null

  // Acoustics
  Acoustic_echosound: string | null
  Acoustic_sonar: string | null
  Acoustic_silent: string | null

  // Oceanographic winches
  OC_winches: number | null
  OC_steelwire_len: number | null
  OC_steelwire_load: number | null
  OC_condcable_len: number | null
  OC_condcable_load: number | null
  OC_trawl_len: number | null
  OC_trawl_load: number | null
  OC_Other_len: number | null
  OC_Other_load: number | null

  // Cranes & gantries
  Gantry_pos: string | null
  Gantry_abovedeck: number | null
  Gantry_outboard_ext: number | null
  Gantry_load: number | null
  Crane_pos: string | null
  Crane_abovedeck: number | null
  Crane_outboard_ext: number | null
  Crane_load: number | null
  Winch_other: string | null

  // Data processing
  DP_Equip: string | null
  DP_Equip_printing: string | null

  // Science equipment
  Radioactive: string | null
  Core_capable: string | null
  Core_grab: string | null
  Core_box: string | null
  Core_gravity: string | null
  Core_piston: string | null
  Core_multi: string | null
  CTD_cap: string | null
  CTD_make: string | null
  CTD_towed: string | null
  CTD_oxy: string | null
  CTD_trans: string | null
  CTD_fluor: string | null
  CTD_rosette: string | null
  Aquis_SMS: string | null
  Aquis_Multibeam: string | null
  Aquis_sidescan: string | null
  Aquis_ADCP: string | null
  Underwater_vehicles: string | null
  Underwater_vehicles_rov: string | null
  Underwater_vehicles_auv: string | null
  Underwater_vehicles_sub: string | null
  Diving_cap: string | null

  // Classification & notes
  Vessel_construct: string | null
  Vessel_class: string | null
  Vessel_other: string | null
  notes: string | null
  amenities: string | null
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

/** Display helper — returns value or em dash */
export function fmt(value: string | number | null | undefined, suffix = ''): string {
  if (value === null || value === undefined || value === '') return '—'
  return `${value}${suffix}`
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
 * Uses the Supabase Storage URL stored in photo_url, falling back to placeholder.
 */
export function getPhotoUrl(vessel: Vessel): string {
  if (vessel.photo_url) return vessel.photo_url
  return getFallbackPhotoUrl(vessel)
}

/** Fallback photo URL */
export function getFallbackPhotoUrl(_vessel: Vessel): string {
  return 'https://jmpxcsihkmyotidxjuyv.supabase.co/storage/v1/object/public/vessel-photos/placeholder.jpg'
}

/**
 * Convert a Supabase Storage URL to a resized thumbnail via the image transform API.
 * Non-Supabase URLs (e.g. picsum fallbacks) are returned unchanged.
 */
export function toThumbnailUrl(url: string, width = 400, quality = 75): string {
  const marker = '/storage/v1/object/public/'
  const idx = url.indexOf(marker)
  if (idx === -1) return url
  const path = url.slice(idx + marker.length)
  const base = url.slice(0, idx)
  return `${base}/storage/v1/render/image/public/${path}?width=${width}&quality=${quality}`
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
