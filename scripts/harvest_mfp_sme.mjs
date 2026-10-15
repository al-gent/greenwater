/**
 * Harvest the per-cruise SME detail pane ("Ship-time & Marine Equipment
 * request" form) from UNOLS MFP for every imported unols_mfp cruise, parse the
 * science content out of it, and write it onto our cruises rows:
 *
 *   raw.sme              – the parsed form (full sections + derived fields)
 *   science_party_size   – "Total Science Party Size" when present
 *   summary              – the Survey Summary prose when it is real prose
 *
 * Panes are cached on disk in mfp-api/raw/sme/{voyage_event_id}_{org}.html
 * (gitignored) so the run is resumable: anything already cached is parsed
 * without a network call. Fetching is polite: ≤ 2 req/s, exponential backoff
 * on 429/5xx/network errors, and the run aborts if the site keeps failing.
 *
 * Usage:
 *   node scripts/harvest_mfp_sme.mjs --dry-run --limit=3   # parse only, no writes
 *   node scripts/harvest_mfp_sme.mjs --upcoming             # departure_at > now only
 *   node scripts/harvest_mfp_sme.mjs --refetch              # ignore the disk cache
 *   node scripts/harvest_mfp_sme.mjs --show=3629            # print parsed object for a voyage event
 *   node scripts/harvest_mfp_sme.mjs                        # everything, cache-first
 */
import dotenv from 'dotenv'
dotenv.config({ path: '.env.local' })
import fs from 'fs'
import path from 'path'
import { createClient } from '@supabase/supabase-js'

const supabase = createClient(process.env.NEXT_PUBLIC_SUPABASE_URL, process.env.SUPABASE_SERVICE_ROLE_KEY)

const args = process.argv.slice(2)
const flag = (n) => args.includes(`--${n}`)
const opt = (n) => args.find((a) => a.startsWith(`--${n}=`))?.split('=')[1]
const dryRun = flag('dry-run')
const upcoming = flag('upcoming')
const refetch = flag('refetch')
const limit = opt('limit') ? parseInt(opt('limit'), 10) : undefined
const show = opt('show') ? String(opt('show')) : null

const SME_CACHE = path.join(process.cwd(), 'mfp-api', 'raw', 'sme')
const BAD_DIR = path.join(SME_CACHE, '_bad')
const MISSES_FILE = path.join(SME_CACHE, '_misses.json')
fs.mkdirSync(SME_CACHE, { recursive: true })

// ── fetch (polite) ───────────────────────────────────────────────────────────
const MIN_INTERVAL_MS = 500 // 2 req/s
const BACKOFF_START_MS = 2000
const BACKOFF_CAP_MS = 60000
const MAX_TRIES = 5
const ABORT_AFTER_CONSECUTIVE_FAILURES = 8
const sleep = (ms) => new Promise((r) => setTimeout(r, ms))
let lastRequestAt = 0

async function throttled() {
  const wait = lastRequestAt + MIN_INTERVAL_MS - Date.now()
  if (wait > 0) await sleep(wait)
  lastRequestAt = Date.now()
}

function smeUrl(ve, org) {
  return `https://www.mfp.us/Programme/Cruise/${ve}?organisation_id=${org}&tab=&caTab=&t=${Date.now()}`
}

/** Returns { html } on success or { miss: reason, fatal?: true } on failure. */
async function fetchPane(ve, org) {
  let delay = BACKOFF_START_MS
  for (let attempt = 1; attempt <= MAX_TRIES; attempt++) {
    await throttled()
    let res, text
    try {
      res = await fetch(smeUrl(ve, org), {
        headers: { 'User-Agent': 'Mozilla/5.0', 'X-Requested-With': 'XMLHttpRequest' },
        signal: AbortSignal.timeout(45000),
      })
      text = await res.text()
    } catch (e) {
      if (attempt === MAX_TRIES) return { miss: `network: ${e?.message ?? e}`, fatal: true }
      await sleep(delay); delay = Math.min(delay * 2, BACKOFF_CAP_MS); continue
    }
    if (res.status === 429 || res.status >= 500) {
      if (attempt === MAX_TRIES) return { miss: `http ${res.status}`, fatal: true }
      await sleep(delay); delay = Math.min(delay * 2, BACKOFF_CAP_MS); continue
    }
    const body = text.trimStart()
    if (body.startsWith('{')) {
      // MFP JSON error envelope, e.g. {"ErrorOccured":true,"Message":"…"} — a miss, never cached.
      let msg = body.slice(0, 160)
      try { const j = JSON.parse(body); msg = j.Message || j.ErrorMessage || j.Error || msg } catch { /* keep raw */ }
      return { miss: `mfp-json: ${String(msg).slice(0, 160)}` }
    }
    if (!res.ok) return { miss: `http ${res.status}` }
    if (!text.includes('summary-section-header')) {
      fs.mkdirSync(BAD_DIR, { recursive: true })
      fs.writeFileSync(path.join(BAD_DIR, `${ve}_${org}.html`), text)
      return { miss: `no-sections (${text.length} bytes, saved to _bad/)` }
    }
    return { html: text }
  }
  return { miss: 'exhausted', fatal: true }
}

// ── html → text ──────────────────────────────────────────────────────────────
// MFP text answers arrive entity-encoded (typographic quotes, dashes, degree signs…).
const NAMED_ENTITIES = {
  nbsp: ' ', amp: '&', lt: '<', gt: '>', quot: '"', apos: "'",
  rsquo: '’', lsquo: '‘', rdquo: '”', ldquo: '“', sbquo: '‚', bdquo: '„',
  ndash: '–', mdash: '—', hellip: '…', middot: '·', bull: '•',
  deg: '°', micro: 'µ', plusmn: '±', times: '×', divide: '÷', frac12: '½', frac14: '¼',
  copy: '©', reg: '®', trade: '™', euro: '€', pound: '£', yen: '¥',
  eacute: 'é', egrave: 'è', ecirc: 'ê', agrave: 'à', aacute: 'á', acirc: 'â', ccedil: 'ç',
  iacute: 'í', oacute: 'ó', ocirc: 'ô', ouml: 'ö', uacute: 'ú', uuml: 'ü', ntilde: 'ñ', auml: 'ä', szlig: 'ß',
  alpha: 'α', beta: 'β', gamma: 'γ', delta: 'δ', mu: 'μ', pi: 'π', sigma: 'σ', omega: 'ω', Delta: 'Δ',
  le: '≤', ge: '≥', ne: '≠', asymp: '≈', infin: '∞', sup2: '²', sup3: '³', permil: '‰', prime: '′', Prime: '″',
  // seen in the harvested summaries
  ensp: ' ', emsp: ' ', thinsp: ' ', ordm: 'º', ordf: 'ª', sim: '∼', crarr: '↵', rarr: '→', larr: '←', minus: '−',
  epsilon: 'ε', theta: 'θ', lambda: 'λ', tau: 'τ', Sigma: 'Σ', Omega: 'Ω', sup1: '¹',
}
function decodeEntities(s) {
  return s
    .replace(/&#(\d+);/g, (_, n) => String.fromCodePoint(+n))
    .replace(/&#x([0-9a-f]+);/gi, (_, n) => String.fromCodePoint(parseInt(n, 16)))
    .replace(/&([a-zA-Z0-9]+);/g, (m, name) => (name in NAMED_ENTITIES ? NAMED_ENTITIES[name] : m))
}

/** Strip markup to text, keeping paragraph breaks (p / br / div / li / tr). */
function htmlToText(s) {
  return decodeEntities(
    s
      .replace(/\r\n?/g, '\n')
      .replace(/<script[\s\S]*?<\/script>/g, '')
      .replace(/<style[\s\S]*?<\/style>/g, '')
      .replace(/<br\s*\/?>/gi, '\n')
      .replace(/<\/(p|div|li|tr|h[1-6])>/gi, '\n')
      .replace(/<[^>]+>/g, ' '),
  )
    .replace(/\u00a0/g, ' ')
    .replace(/[ \t]+/g, ' ')
    .replace(/ *\n */g, '\n')
    .replace(/\n{3,}/g, '\n\n')
    .trim()
}
const oneLine = (s) => htmlToText(s).replace(/\s+/g, ' ').trim()

/**
 * The value of a free-text answer is injected client-side:
 *   <div id='text-input-…'></div><script> const data = "<json string of html>"; $(…).replaceWith(DOMPurify.sanitize(data)) </script>
 * Pull the JSON string out; otherwise fall back to the rendered markup.
 */
function textValue(inner) {
  const m = inner.match(/const data = ("(?:[^"\\]|\\.)*")/)
  if (m) {
    try { return htmlToText(JSON.parse(m[1])) } catch { /* fall through */ }
  }
  return htmlToText(inner)
}
const blank = (v) => v === '' || v === '-' || v === '—'

/** Given the index of an opening `<tag …>`, return { inner, end } using tag-depth counting. */
function extractElement(html, openIdx) {
  const tagM = /^<([a-zA-Z0-9]+)/.exec(html.slice(openIdx, openIdx + 20))
  if (!tagM) return null
  const tag = tagM[1]
  const re = new RegExp(`<(/?)${tag}\\b[^>]*>`, 'gi')
  re.lastIndex = openIdx
  let depth = 0, m, start = -1
  while ((m = re.exec(html))) {
    if (m[1] === '/') {
      depth--
      if (depth === 0) return { inner: html.slice(start, m.index), end: m.index + m[0].length }
    } else {
      if (m[0].endsWith('/>')) continue
      if (depth === 0) start = m.index + m[0].length
      depth++
    }
  }
  return null
}

/** Find the next element (from `from`) whose class attribute contains `cls`. */
function findByClass(html, cls, from, before = Infinity) {
  const re = /<(div|span|ul|li|table|label)\b[^>]*class=(?:"[^"]*"|'[^']*')[^>]*>/g
  re.lastIndex = from
  let m
  while ((m = re.exec(html))) {
    if (m.index >= before) return null
    const classAttr = /class=("[^"]*"|'[^']*')/.exec(m[0])?.[1]?.slice(1, -1) ?? ''
    if (classAttr.split(/\s+/).includes(cls)) return { idx: m.index, tag: m[1] }
  }
  return null
}

// ── parse ────────────────────────────────────────────────────────────────────
/** `label.<labelClass>` + following `.<valueClass>` pairs within `body`. */
function parseLabelValueRows(body, labelClass, valueClass) {
  const rows = []
  const re = new RegExp(`<label class="${labelClass}"[^>]*>`, 'g')
  let m
  while ((m = re.exec(body))) {
    const lab = extractElement(body, m.index)
    if (!lab) continue
    // labels can carry hidden validation spans ("General Discipline <span class=\"… k-hidden\">Please, specify…</span>")
    const label = oneLine(lab.inner.replace(/<span class="[^"]*k-hidden[^"]*"[\s\S]*?<\/span>/g, ''))
    const nextLabel = re.exec(body)?.index ?? body.length
    re.lastIndex = lab.end
    const val = findByClass(body, valueClass, lab.end, nextLabel)
    let value = ''
    if (val) {
      const el = extractElement(body, val.idx)
      if (el) value = textValue(el.inner)
    }
    if (label) rows.push({ label, value: blank(value) ? '' : value })
  }
  return rows
}

/** Q&A inside a question-pane; only answered questions are kept. */
function parseQuestionPane(paneInner) {
  const out = []
  const re = /<div class="field-display-container[^"]*"[^>]*data-display-field-name=question_(\d+)[^>]*>\s*<label class="field-display-label">([\s\S]*?)<\/label>/g
  let m
  while ((m = re.exec(paneInner))) {
    const content = findByClass(paneInner, 'field-display-content', re.lastIndex)
    if (!content) continue
    const el = extractElement(paneInner, content.idx)
    if (!el) continue
    const answer = textValue(el.inner)
    if (!blank(answer)) out.push({ question_id: +m[1], question: oneLine(m[2]), answer })
    re.lastIndex = el.end
  }
  return out
}

/**
 * Checked equipment items (only checked ones are rendered by MFP) with any
 * answered per-item questions.
 */
function parseCheckedItems(body) {
  const items = []
  const re = /selection-check-icon">check_small<\/span>\s*<(?:label[^>]*|div class="item-text question-group-header")>([^<]*)</g
  const positions = []
  let m
  while ((m = re.exec(body))) positions.push({ name: oneLine(m[1]), at: m.index, after: re.lastIndex })
  for (let i = 0; i < positions.length; i++) {
    const p = positions[i]
    const limitAt = positions[i + 1]?.at ?? body.length
    const pane = findByClass(body, 'question-pane', p.after, limitAt)
    let questions = []
    if (pane) {
      const el = extractElement(body, pane.idx)
      if (el) questions = parseQuestionPane(el.inner)
    }
    items.push({ name: p.name, questions })
  }
  return items
}

/** Contact tables under "Project Contacts": one entry per person, tagged with its subheader. */
function parseContacts(body) {
  const people = []
  const groupRe = /<h5 class="summary-section-subheader">([\s\S]*?)<\/h5>/g
  const groups = []
  let m
  while ((m = groupRe.exec(body))) groups.push({ title: oneLine(m[1]), at: m.index })
  const tableRe = /<table class="mfp-table[^"]*">/g
  while ((m = tableRe.exec(body))) {
    const t = extractElement(body, m.index)
    if (!t) continue
    const group = [...groups].reverse().find((g) => g.at < m.index)?.title ?? null
    const headers = [...t.inner.matchAll(/<th\b[^>]*>([\s\S]*?)<\/th>/g)].map((h) => oneLine(h[1]).toLowerCase())
    const tbody = /<tbody>([\s\S]*?)<\/tbody>/.exec(t.inner)?.[1] ?? ''
    for (const tr of tbody.matchAll(/<tr\b[^>]*>([\s\S]*?)<\/tr>/g)) {
      const cells = [...tr[1].matchAll(/<td\b[^>]*>([\s\S]*?)<\/td>/g)].map((c) => c[1])
      if (!cells.length) continue
      const col = (name) => { const i = headers.findIndex((h) => h === name); return i >= 0 && cells[i] != null ? oneLine(cells[i]) : null }
      const nameCell = cells.find((c) => c.includes('person-display-name')) ?? cells[0]
      const name = oneLine(/person-display-name">([\s\S]*?)<\/span>/.exec(nameCell)?.[1] ?? nameCell)
      if (!name) continue
      const person = { group, name }
      const org = col('organisation'); if (org) person.organisation = org
      const email = col('email'); if (email) person.email = email
      const onVoyage = col('on voyage'); if (onVoyage) person.on_voyage = onVoyage
      const position = col('position'); if (position) person.position = position
      people.push(person)
    }
    tableRe.lastIndex = t.end
  }
  return people
}

/** Funding entries (funding-header / funding-value pairs per funding-detail-entry block). */
function parseFunding(body) {
  const out = []
  const re = /<div class="funding-detail-box funding-detail-entry">/g
  let m
  while ((m = re.exec(body))) {
    const el = extractElement(body, m.index)
    if (!el) continue
    const rows = parseLabelValueRows(el.inner, 'funding-header', 'funding-value')
    const get = (l) => rows.find((r) => r.label.toLowerCase() === l)?.value || null
    out.push({ source: get('funding source'), division: get('division'), program: get('program'), grant_number: get('grant or project number'), status: get('status') })
    re.lastIndex = el.end
  }
  return out
}

const toInt = (v) => { const m = /^\s*(-?\d+)/.exec(v ?? ''); return m ? parseInt(m[1], 10) : null }
const toNum = (v) => { const m = /^\s*(-?\d+(?:\.\d+)?)/.exec(v ?? ''); return m ? parseFloat(m[1]) : null }
const yn = (v) => (v == null || v === '' ? null : /^yes\b/i.test(v) ? true : /^no\b/i.test(v) ? false : v)

function parseSme(html) {
  const sections = []
  const parts = html.split(/<h4 class="summary-section-header">/)
  for (const part of parts.slice(1)) {
    const titleEnd = part.indexOf('</h4>')
    const title = oneLine(part.slice(0, titleEnd))
    const body = part.slice(titleEnd + 5)
    const rows = parseLabelValueRows(body, 'data-row-label', 'data-row-value')
    const subsections = [...body.matchAll(/<h5 class="summary-section-subheader">([\s\S]*?)<\/h5>/g)].map((m) => oneLine(m[1]))
    const section = { title, rows }
    if (subsections.length) section.subsections = subsections
    if (title === 'Funding Source') section.funding = parseFunding(body)
    if (title === 'Project Contacts') section.contacts = parseContacts(body)
    if (/Equipment/.test(title)) section.checked = parseCheckedItems(body)
    sections.push(section)
  }

  const sec = (t) => sections.find((s) => s.title === t)
  // nth occurrence of a label within a section (Cruise Location has two "Remarks")
  const row = (t, label, nth = 0) => (sec(t)?.rows ?? []).filter((r) => r.label === label)[nth]?.value ?? null
  const nz = (v) => (v == null || v === '' ? null : v)

  const surveySummary = nz(row('Survey Information', 'Survey Summary'))
  const fieldWork = nz(row('Survey Information', 'Summary of Field Work'))
  // The cruise objective: Survey Summary when it is real prose, else Summary of Field Work.
  let summary_text = null
  if (surveySummary && surveySummary.length > 40) summary_text = surveySummary
  else if (fieldWork && fieldWork.length > 40) summary_text = fieldWork
  else summary_text = [surveySummary, fieldWork].filter(Boolean).sort((a, b) => b.length - a.length)[0] ?? null

  const funding = sec('Funding Source')?.funding ?? []
  const pooled = sec('Pooled and Portable Equipment')?.checked ?? []
  const shipFitted = sec('Ship Fitted Equipment')?.checked ?? []
  const mooringItem = pooled.find((i) => /mooring/i.test(i.name))
  const mooringQ = (re) => mooringItem?.questions.find((q) => re.test(q.question))?.answer ?? null

  const meia = Object.fromEntries((sec('Marine Environmental Impact Assessment')?.rows ?? []).map((r) => [r.label, r.value]))
  const meiaKey = (re) => { const k = Object.keys(meia).find((l) => re.test(l)); return k ? yn(meia[k]) : null }

  const sme0 = {
    sections,
    project_name: nz(row('Survey Information', 'Name')),
    project_short_name: nz(row('Survey Information', 'Short name')),
    website: nz(row('Survey Information', 'Website URL')),
    // "General Discipline" is multi-select; MFP renders the choices comma-separated across lines
    disciplines: (row('Survey Information', 'General Discipline') ?? '').split(/\s*[\n,]+\s*/).map((x) => x.trim()).filter(Boolean),
    summary_text,
    survey_summary: surveySummary,
    field_work_summary: fieldWork,
    contacts: sec('Project Contacts')?.contacts ?? [],
    funding,
    funding_source: funding[0]?.source ?? null,
    funding_division: funding[0]?.division ?? null,
    funding_program: funding[0]?.program ?? null,
    grant_number: funding[0]?.grant_number ?? null,
    funding_status: funding[0]?.status ?? null,
    other_funding_details: nz(row('Funding Source', 'If funding source is indicated as "Other" above, please provide details of the funding source below.')),
    mobilization_port: nz(row('Cruise Location', 'Preferred mobilization port')),
    demobilization_port: nz(row('Cruise Location', 'Preferred demobilization port')),
    port_rationale: nz(row('Cruise Location', 'Remarks', 0)),
    general_location: nz(row('Cruise Location', 'General location')),
    location_remarks: nz(row('Cruise Location', 'Remarks', 1)),
    preferred_date: nz(row('Cruise Dates', 'Preferred date')),
    earliest_start_date: nz(row('Cruise Dates', 'Earliest acceptable science start date')),
    latest_start_date: nz(row('Cruise Dates', 'Latest acceptable science start date')),
    dates_remarks: nz(row('Cruise Dates', 'Remarks')),
    ancillary_no_extra_days: yn(row('Cruise Dates', 'This is an ancillary project that does not require additional days?')),
    science_days: toNum(row('Cruise Dates', 'Science Days')),
    load_days: toNum(row('Cruise Dates', 'Load Days')),
    unload_days: toNum(row('Cruise Dates', 'Unload Days')),
    transit_days: toNum(row('Cruise Dates', 'Transit Days')),
    total_days: toNum(row('Cruise Dates', 'Total days')),
    // "Preferred Ship" is a list (unscheduled requests name several acceptable ships)
    preferred_ships: (row('Ship Selection and Science Party', 'Preferred Ship') ?? '').split(/\n+/).map((x) => x.trim()).filter(Boolean),
    ship_rationale: nz(row('Ship Selection and Science Party', 'Please give details for your choice above')),
    multi_ship: yn(row('Ship Selection and Science Party', 'Does your project require a multi-ship operation?')),
    science_party_size: toInt(row('Ship Selection and Science Party', 'Total Science Party Size')),
    science_teams: toInt(row('Ship Selection and Science Party', 'Number of different science teams')),
    operator_techs: toInt(row('Ship Selection and Science Party', 'Number of Operator Provided Technicians needed')),
    berths_requested_total: toInt(row('Ship Selection and Science Party', 'Total')),
    science_party_remarks: nz(row('Ship Selection and Science Party', 'Remarks')),
    equipment: {
      ship_fitted: shipFitted.map((i) => i.name),
      ship_fitted_rationale: nz(row('Ship Fitted Equipment', 'Explain the rationale for the choices and state the flexibility to potentially use other equipment.')),
      ship_fitted_other: nz(row('Ship Fitted Equipment', 'Other ship fitted equipment that may affect scheduling')),
      pooled_portable: pooled.map((i) => i.name),
      pooled_portable_remarks: nz(row('Pooled and Portable Equipment', 'Please discuss your requirements for the above equipment.')),
      user_supplied: nz(row('User Supplied Equipment', 'Over the side handling system requirements')),
      vans: toInt(row('User Supplied Equipment', 'Please list the number of science provided vans.')),
      itar_ear_license: nz(row('User Supplied Equipment', 'Does your equipment require an ITAR or EAR license?')),
      // every answered per-item question, for both lists
      questions: [...pooled, ...shipFitted].flatMap((i) => i.questions.map((q) => ({ item: i.name, question: q.question, answer: q.answer }))),
    },
    mooring: {
      has_moorings: !!mooringItem,
      description: mooringQ(/description of your proposed mooring work/i),
      subcontracted: mooringQ(/sub-contracted/i),
      surface_or_subsurface: mooringQ(/surface or subsurface/i),
      max_depth_m: toNum(mooringQ(/max depth/i)),
      deepest_location_depth_m: toNum(mooringQ(/depth of deepest mooring location/i)),
      heaviest_anchor: mooringQ(/heaviest anchor/i),
      heaviest_float_or_instrument: mooringQ(/heaviest float/i),
      deployments: toInt(mooringQ(/number of deployments/i)),
      recoveries: toInt(mooringQ(/number of recoveries/i)),
      questions: mooringItem?.questions ?? [],
    },
    environmental: {
      seasonal_constraints: meiaKey(/seasonal environmental constraints/i),
      unrecovered_equipment: meiaKey(/remain unrecovered/i),
      unrecovered_hazardous: meiaKey(/not planned to be recovered hazardous/i),
      substances_introduced: meiaKey(/substances to be purposefully introduced/i),
      organisms_sampled: meiaKey(/marine organisms be intentionally sampled/i),
      import_biological_samples: meiaKey(/recover and import any biological/i),
      hazmat: meiaKey(/hazardous materials for the cruise/i),
      radioisotopes: meiaKey(/radioisotopes/i),
      natural_abundance_isotopes: meiaKey(/natural abundance isotope/i),
      mmpa_iha: meiaKey(/Marine Mammal Protection Act/i),
      answers: meia, // full label → answer map, in case labels differ per form version
    },
  }
  const sme = { ...sme0, discipline: sme0.disciplines.join(', ') || null }
  // drop mooring detail when there is no mooring item so the object stays honest
  if (!mooringItem) sme.mooring = { has_moorings: false }
  return sme
}

// ── db ───────────────────────────────────────────────────────────────────────
// PostgREST caps responses at 1,000 rows server-side; page through.
async function fetchAll(table, cols, filter = (q) => q) {
  const out = []
  for (let from = 0; ; from += 1000) {
    const { data, error } = await filter(supabase.from(table).select(cols)).range(from, from + 999)
    if (error) throw error
    out.push(...data)
    if (data.length < 1000) return out
  }
}

// ── main ─────────────────────────────────────────────────────────────────────
const cruises = await fetchAll('cruises', 'id, external_refs, raw, summary, science_party_size, departure_at', (q) => {
  q = q.eq('source', 'unols_mfp').order('departure_at', { ascending: false })
  if (upcoming) q = q.gt('departure_at', new Date().toISOString())
  return q
})

const keyOf = (c) => ({ ve: c.external_refs?.voyage_event_id, org: c.external_refs?.organisation_id })
const cacheFile = (c) => { const { ve, org } = keyOf(c); return path.join(SME_CACHE, `${ve}_${org}.html`) }
const isCached = (c) => !refetch && fs.existsSync(cacheFile(c))

// Cache-first ordering: cached panes parse instantly, then the network work (most recent departures first).
let queue = cruises.filter((c) => { const { ve, org } = keyOf(c); return ve != null && org != null })
const noKeys = cruises.length - queue.length
queue.sort((a, b) => Number(isCached(b)) - Number(isCached(a)))
if (limit) queue = queue.slice(0, limit)

console.log(`cruises ${cruises.length}${upcoming ? ' (upcoming)' : ''} → queued ${queue.length} (${queue.filter(isCached).length} cached${noKeys ? `, ${noKeys} without fetch keys` : ''})${dryRun ? ' [dry run]' : ''}`)

const stats = { fetched: 0, cached: 0, misses: 0, parsed: 0, parseErrors: 0, withSummary: 0, summaryWritten: 0, withParty: 0, withEquipment: 0, emptyPane: 0, written: 0, errors: 0 }
const disciplines = new Map()
const misses = []
let consecutiveFailures = 0

for (let i = 0; i < queue.length; i++) {
  const c = queue[i]
  const { ve, org } = keyOf(c)
  const file = cacheFile(c)
  let html, fetchedAt

  if (isCached(c)) {
    html = fs.readFileSync(file, 'utf8')
    fetchedAt = fs.statSync(file).mtime.toISOString()
    stats.cached++
  } else {
    const r = await fetchPane(ve, org)
    if (r.miss) {
      stats.misses++
      misses.push({ cruise_id: c.id, voyage_event_id: ve, organisation_id: org, reason: r.miss })
      console.warn(`  miss ${ve}_${org}: ${r.miss}`)
      if (r.fatal && ++consecutiveFailures >= ABORT_AFTER_CONSECUTIVE_FAILURES) {
        console.error(`\n${consecutiveFailures} consecutive fetch failures — the site looks unhappy; stopping here (resumable, rerun later).`)
        break
      }
      continue
    }
    consecutiveFailures = 0
    html = r.html
    fetchedAt = new Date().toISOString()
    fs.writeFileSync(file, html)
    stats.fetched++
  }

  let sme
  try {
    sme = { fetched_at: fetchedAt, parsed_at: new Date().toISOString(), source_url: `https://www.mfp.us/Programme/Cruise/${ve}?organisation_id=${org}`, ...parseSme(html) }
  } catch (e) {
    stats.parseErrors++
    console.error(`  parse error ${ve}_${org}: ${e?.message ?? e}`)
    continue
  }
  stats.parsed++
  if (!sme.sections.length) stats.emptyPane++
  if (sme.summary_text) stats.withSummary++
  if (sme.science_party_size != null) stats.withParty++
  if (sme.equipment.ship_fitted.length || sme.equipment.pooled_portable.length) stats.withEquipment++
  for (const d of sme.disciplines) disciplines.set(d, (disciplines.get(d) || 0) + 1)

  if (show && String(ve) === show) {
    console.log(`\n=== parsed SME for voyage_event ${ve} (org ${org}, cruise ${c.id}) ===`)
    console.log(JSON.stringify(sme, null, 2))
    console.log('=== end ===\n')
  }

  const update = { raw: { ...(c.raw || {}), sme } }
  if (sme.science_party_size != null) update.science_party_size = sme.science_party_size
  if (sme.summary_text && sme.summary_text.length > 40) { update.summary = sme.summary_text; stats.summaryWritten++ }

  if (dryRun) {
    console.log(`  ${ve}_${org} ${isCached(c) ? '(cache)' : '(fetched)'} sections=${sme.sections.length} discipline=${sme.discipline ?? '-'} party=${sme.science_party_size ?? '-'} equip=${sme.equipment.ship_fitted.length}+${sme.equipment.pooled_portable.length} summary=${sme.summary_text ? sme.summary_text.length + ' chars' : '-'}`)
  } else {
    // Supabase writes occasionally fail with a transient "fetch failed"; retry a few times.
    let error
    for (let attempt = 1; attempt <= 3; attempt++) {
      ;({ error } = await supabase.from('cruises').update(update).eq('id', c.id))
      if (!error) break
      await sleep(1000 * attempt)
    }
    if (error) { stats.errors++; console.error(`  update ${c.id} failed: ${error.message}`) } else stats.written++
  }

  if ((i + 1) % 50 === 0) console.log(`[${i + 1}/${queue.length}] fetched ${stats.fetched} cached ${stats.cached} misses ${stats.misses} written ${stats.written}`)
}

if (misses.length) fs.writeFileSync(MISSES_FILE, JSON.stringify({ at: new Date().toISOString(), misses }, null, 2))

console.log(`\nDone${dryRun ? ' (dry run — nothing written)' : ''}:`)
console.log(`  panes: fetched ${stats.fetched}, from cache ${stats.cached}, misses ${stats.misses}${misses.length ? ` (see ${path.relative(process.cwd(), MISSES_FILE)})` : ''}`)
console.log(`  parsed ${stats.parsed} (empty panes ${stats.emptyPane}, parse errors ${stats.parseErrors})`)
console.log(`  with summary ${stats.withSummary} (summary column ${dryRun ? 'would be ' : ''}overwritten ${stats.summaryWritten}), with party size ${stats.withParty}, with equipment ${stats.withEquipment}`)
console.log(`  rows updated ${stats.written}, errors ${stats.errors}`)
console.log(`  top disciplines:`, [...disciplines.entries()].sort((a, b) => b[1] - a[1]).slice(0, 5).map(([d, n]) => `${d} (${n})`).join(', ') || '-')
if (stats.errors || stats.parseErrors) process.exitCode = 1
