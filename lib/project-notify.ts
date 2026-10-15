/**
 * Emails for the project ↔ bid handshake. Each is fire-and-forget from its API route: a
 * failed email never fails the action. Recipients honour the 'messages' notification pref.
 * Server-only.
 */
import { supabaseAdmin } from './supabase-admin'
import { getVesselOperators } from './operators'
import { wantsMessageEmails } from './message-notify'
import { sendEmail, bidOfferedEmail, bidAcceptedEmail, bidConfirmedEmail, bidDeclinedEmail, bidWithdrawnEmail } from './brevo'
import { fmtDateRange } from './cruise-utils'

const site = () => (process.env.NEXT_PUBLIC_SITE_URL ?? 'https://vesselconnect.org').replace(/\/$/, '')
const money = (amount: number | null, currency: string | null) => amount == null ? null : new Intl.NumberFormat('en-US', { style: 'currency', currency: currency || 'USD', maximumFractionDigits: 0 }).format(amount)

async function load(bidId: string) {
  const { data: b } = await supabaseAdmin.from('project_bids').select('id, vessel_id, proposed_departure_at, proposed_arrival_at, berths, cost_amount, cost_currency, cruise_id, project:projects(id, slug, title, created_by), vessel:vessels(id, name, operator_name)').eq('id', bidId).single()
  if (!b) return null
  const project = (Array.isArray(b.project) ? b.project[0] : b.project) as { id: string; slug: string; title: string; created_by: string | null } | null
  const vessel = (Array.isArray(b.vessel) ? b.vessel[0] : b.vessel) as { id: number; name: string; operator_name: string | null } | null
  if (!project || !vessel) return null
  const author = project.created_by ? (await supabaseAdmin.from('profiles').select('email, first_name, last_name, notification_prefs').eq('id', project.created_by).maybeSingle()).data : null
  return { bid: b, project, vessel, author, dates: fmtDateRange(b.proposed_departure_at, b.proposed_arrival_at) }
}

const safe = (p: Promise<unknown>) => p.catch((e) => console.error('project-notify:', e))

export function notifyBidOffered(bidId: string) {
  return safe((async () => {
    const x = await load(bidId); if (!x?.author?.email || !wantsMessageEmails(x.author.notification_prefs)) return
    await sendEmail({ to: x.author.email, subject: `New bid on ${x.project.title} from ${x.vessel.name}`, html: bidOfferedEmail(x.project.title, x.vessel.name, x.vessel.operator_name, x.dates, x.bid.berths, money(x.bid.cost_amount, x.bid.cost_currency), `${site()}/projects/${x.project.slug}`), tags: ['bid-offered'] })
  })())
}

export function notifyBidAccepted(bidId: string) {
  return safe((async () => {
    const x = await load(bidId); if (!x) return
    const researcher = [x.author?.first_name, x.author?.last_name].filter(Boolean).join(' ') || 'The researcher'
    for (const op of await getVesselOperators(x.vessel.id)) {
      if (!op.email || !wantsMessageEmails(op.notification_prefs)) continue
      await sendEmail({ to: op.email, subject: `Your bid on ${x.project.title} was accepted — confirm to schedule`, html: bidAcceptedEmail(x.project.title, x.vessel.name, researcher, x.dates, `${site()}/dashboard?tab=projects`), tags: ['bid-accepted'] })
    }
  })())
}

export function notifyBidConfirmed(bidId: string, cruiseSlug: string) {
  return safe((async () => {
    const x = await load(bidId); if (!x?.author?.email || !wantsMessageEmails(x.author.notification_prefs)) return
    await sendEmail({ to: x.author.email, subject: `${x.project.title} is scheduled on ${x.vessel.name}`, html: bidConfirmedEmail(x.project.title, x.vessel.name, x.dates, `${site()}/cruises/${cruiseSlug}`), tags: ['bid-confirmed'] })
  })())
}

export function notifyBidDeclined(bidId: string) {
  return safe((async () => {
    const x = await load(bidId); if (!x) return
    for (const op of await getVesselOperators(x.vessel.id)) {
      if (!op.email || !wantsMessageEmails(op.notification_prefs)) continue
      await sendEmail({ to: op.email, subject: `Bid on ${x.project.title} not taken`, html: bidDeclinedEmail(x.project.title, x.vessel.name, `${site()}/projects/${x.project.slug}`), tags: ['bid-declined'] })
    }
  })())
}

export function notifyBidWithdrawn(bidId: string) {
  return safe((async () => {
    const x = await load(bidId); if (!x?.author?.email || !wantsMessageEmails(x.author.notification_prefs)) return
    await sendEmail({ to: x.author.email, subject: `${x.vessel.name} withdrew its bid on ${x.project.title}`, html: bidWithdrawnEmail(x.project.title, x.vessel.name, `${site()}/projects/${x.project.slug}`), tags: ['bid-withdrawn'] })
  })())
}
