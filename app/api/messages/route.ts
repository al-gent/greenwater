import { NextResponse } from 'next/server'
import { getServerUser } from '@/lib/supabase-server'
import { supabaseAdmin } from '@/lib/supabase-admin'
import {
  sendEmail,
  newInquiryOperatorEmail,
  unclaimedVesselInquiryEmail,
  unroutedInquiryAdminEmail,
} from '@/lib/brevo'
import { notifyAdmins } from '@/lib/admin-notify'

const EMAIL_SHAPE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/

export async function POST(request: Request) {
  const user = await getServerUser()
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const { data: profile } = await supabaseAdmin
    .from('profiles')
    .select('verified, first_name, last_name, institution, title')
    .eq('id', user.id)
    .single()

  if (!profile?.verified) {
    return NextResponse.json({ error: 'Account not yet verified' }, { status: 403 })
  }

  const body = await request.json()
  const { vessel_id, body: messageBody, start_date, end_date } = body

  if (!vessel_id || !messageBody?.trim()) {
    return NextResponse.json({ error: 'vessel_id and body are required' }, { status: 400 })
  }

  const newId = crypto.randomUUID()
  const { error: insertError } = await supabaseAdmin.from('messages').insert({
    id: newId,
    thread_id: newId,
    vessel_id,
    author_id: user.id,
    author_role: 'scientist',
    body: messageBody.trim(),
    start_date: start_date ?? null,
    end_date: end_date ?? null,
    status: 'new',
  })

  if (insertError) {
    console.error('Message insert error:', insertError)
    return NextResponse.json({ error: insertError.message }, { status: 500 })
  }

  // Notify the vessel side in background — never fail the insert.
  // Routing: registered operator(s) → their accounts' emails; unclaimed but
  // vessel has a contact email on file → invite-to-claim email; neither →
  // admins get pinged to facilitate by hand. The route taken is stamped on
  // the thread root (notified_via / notified_email / delivery_status).
  ;(async () => {
    try {
      const siteUrl = process.env.NEXT_PUBLIC_SITE_URL ?? ''
      const scientistName = [profile.first_name, profile.last_name].filter(Boolean).join(' ') || 'A researcher'
      const affiliation = [profile.title, profile.institution].filter(Boolean).join(', ')

      const { data: vessel } = await supabaseAdmin
        .from('vessels')
        .select('name, email, contact_email, contact')
        .eq('id', vessel_id)
        .single()
      const vesselName = vessel?.name ?? 'your vessel'

      // All operators for the vessel — a vessel can legitimately have several
      const { data: operators } = await supabaseAdmin
        .from('profiles')
        .select('email')
        .eq('vessel_id', vessel_id)
        .eq('role', 'operator')
      const operatorEmails = (operators ?? []).map((o) => o.email).filter(Boolean) as string[]

      let notified: { notified_via: string; notified_email: string | null; delivery_status: string | null }

      if (operatorEmails.length > 0) {
        const dashboardUrl = `${siteUrl}/dashboard`
        await Promise.allSettled(
          operatorEmails.map((to) =>
            sendEmail({
              to,
              subject: `New inquiry for ${vesselName} — Greenwater Foundation`,
              html: newInquiryOperatorEmail(
                profile.first_name ?? '',
                profile.last_name ?? '',
                profile.institution ?? '',
                profile.title ?? '',
                vesselName,
                messageBody.trim(),
                dashboardUrl,
              ),
            }).catch((e) => console.error('Operator notification failed for', to, e)),
          ),
        )
        notified = { notified_via: 'operator', notified_email: operatorEmails.join(', '), delivery_status: 'sent' }
      } else {
        // Vessel contact emails are scraped data — take the first plausible one
        const vesselEmail = [vessel?.email, vessel?.contact_email]
          .map((e) => e?.trim())
          .find((e) => e && EMAIL_SHAPE.test(e))

        notified = { notified_via: 'unrouted', notified_email: null, delivery_status: null }

        if (vesselEmail) {
          try {
            const dates = [start_date, end_date].filter(Boolean).join(' – ')
            await sendEmail({
              to: vesselEmail,
              subject: `A researcher is interested in chartering ${vesselName}`,
              html: unclaimedVesselInquiryEmail(
                vesselName,
                vessel?.contact?.trim() ?? '',
                scientistName,
                affiliation,
                messageBody.trim(),
                dates,
                `${siteUrl}/vessels/${vessel_id}`,
              ),
              // Webhook (app/api/webhooks/brevo) matches this tag to record
              // delivered/bounced on the thread — these addresses are stale-prone.
              tags: [`inquiry-${newId}`],
            })
            notified = { notified_via: 'vessel_email', notified_email: vesselEmail, delivery_status: 'sent' }
          } catch (e) {
            console.error('Vessel-email notification failed, falling back to admins:', e)
          }
        }

        if (notified.notified_via === 'unrouted') {
          await notifyAdmins(
            'unrouted_inquiry',
            `Inquiry needs hand-routing: ${vesselName}`,
            unroutedInquiryAdminEmail(vesselName, scientistName, affiliation, messageBody.trim(), `${siteUrl}/admin`),
          )
        }
      }

      await supabaseAdmin.from('messages').update(notified).eq('id', newId)
    } catch (e) {
      console.error('Inquiry notification failed:', e)
    }
  })()

  return NextResponse.json({ success: true, thread_id: newId }, { status: 201 })
}
