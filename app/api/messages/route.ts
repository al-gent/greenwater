import { NextResponse } from 'next/server'
import { getServerUser } from '@/lib/supabase-server'
import { supabaseAdmin } from '@/lib/supabase-admin'
import {
  sendEmail,
  newInquiryOperatorEmail,
  scientistReplyOperatorEmail,
  unclaimedVesselInquiryEmail,
  unroutedInquiryAdminEmail,
  newMessageAdminEmail,
} from '@/lib/brevo'
import { notifyAdmins } from '@/lib/admin-notify'
import { operatorRecipients } from '@/lib/message-notify'

const EMAIL_SHAPE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/

export async function POST(request: Request) {
  const user = await getServerUser()
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  // Any signed-in account can message (the verified gate was dropped 8/28 —
  // friction removal; every conversation still lands in the admin feed, so
  // abuse is visible and the gate can come back if spam appears).
  const { data: profile } = await supabaseAdmin
    .from('profiles')
    .select('first_name, last_name, institution, title')
    .eq('id', user.id)
    .single()

  if (!profile) {
    return NextResponse.json({ error: 'Profile not found' }, { status: 403 })
  }

  const body = await request.json()
  const { vessel_id, body: messageBody, start_date, end_date } = body

  if (!vessel_id || !messageBody?.trim()) {
    return NextResponse.json({ error: 'vessel_id and body are required' }, { status: 400 })
  }

  const scientistName = [profile.first_name, profile.last_name].filter(Boolean).join(' ') || 'A researcher'
  const affiliation = [profile.title, profile.institution].filter(Boolean).join(', ')
  const siteUrl = process.env.NEXT_PUBLIC_SITE_URL ?? ''
  const adminUrl = `${siteUrl}/admin`

  // One conversation per scientist ↔ vessel: a repeat "Connect" send continues
  // the existing thread instead of spawning a parallel one. (PostgREST can't
  // compare two columns, so roots are picked out in JS.)
  const { data: authorMessages } = await supabaseAdmin
    .from('messages')
    .select('id, thread_id, created_at')
    .eq('author_id', user.id)
    .eq('vessel_id', vessel_id)
  const existingRoot = (authorMessages ?? [])
    .filter((m) => m.thread_id === m.id)
    .sort((a, b) => new Date(b.created_at).getTime() - new Date(a.created_at).getTime())[0]

  const { data: vessel } = await supabaseAdmin
    .from('vessels')
    .select('name, email, contact_email, contact, operator_name, owner, url_ship, url_operator, country, port_city, port_state, imo_number, mmsi, call_sign, operator_add1, operator_add2, operator_add3')
    .eq('id', vessel_id)
    .single()
  const vesselName = vessel?.name ?? 'your vessel'

  // Operator-hunting leads for the hand-routing email — whatever's on file
  const str = (v: unknown) => (typeof v === 'string' ? v.trim() : v != null ? String(v) : '')
  const vesselDetails: Array<[string, string]> = (
    [
      ['Vessel', `${vesselName} — ${siteUrl}/vessels/${vessel_id}`],
      ['Operator', str(vessel?.operator_name)],
      ['Owner', str(vessel?.owner)],
      ['Contact person', str(vessel?.contact)],
      ['Operator address', [vessel?.operator_add1, vessel?.operator_add2, vessel?.operator_add3].map(str).filter(Boolean).join(', ')],
      ['Home port', [vessel?.port_city, vessel?.port_state, vessel?.country].map(str).filter(Boolean).join(', ')],
      ['Vessel website', str(vessel?.url_ship)],
      ['Operator website', str(vessel?.url_operator)],
      ['IMO', str(vessel?.imo_number)],
      ['MMSI', str(vessel?.mmsi)],
      ['Call sign', str(vessel?.call_sign)],
    ] as Array<[string, string]>
  ).filter(([, v]) => v)

  // ── Continue an existing conversation ────────────────────────────────────
  if (existingRoot) {
    const { error: replyError } = await supabaseAdmin.from('messages').insert({
      thread_id: existingRoot.id,
      vessel_id,
      author_id: user.id,
      author_role: 'scientist',
      body: messageBody.trim(),
      start_date: start_date ?? null,
      end_date: end_date ?? null,
    })
    if (replyError) {
      console.error('Message insert error:', replyError)
      return NextResponse.json({ error: replyError.message }, { status: 500 })
    }
    await supabaseAdmin.from('messages').update({ status: 'new' }).eq('id', existingRoot.id)

    ;(async () => {
      try {
        const recipients = await operatorRecipients(vessel_id)
        const dashboardUrl = `${siteUrl}/dashboard`
        await Promise.allSettled(
          recipients.map((to) =>
            sendEmail({
              to,
              subject: `New message about ${vesselName} — Greenwater Foundation`,
              html: scientistReplyOperatorEmail(vesselName, scientistName, messageBody.trim(), dashboardUrl),
            }).catch((e) => console.error('Operator notification failed for', to, e)),
          ),
        )
        await notifyAdmins(
          'messages',
          `${scientistName} messaged ${vesselName}`,
          newMessageAdminEmail(vesselName, scientistName, 'scientist', messageBody.trim(), adminUrl),
        )
      } catch (e) {
        console.error('Message notification failed:', e)
      }
    })()

    return NextResponse.json({ success: true, thread_id: existingRoot.id }, { status: 201 })
  }

  // ── New conversation ─────────────────────────────────────────────────────
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
  // nothing (admins see every message anyway, unrouted ones flagged). The
  // route taken is stamped on the thread root.
  ;(async () => {
    try {
      const recipients = await operatorRecipients(vessel_id)

      let notified: { notified_via: string; notified_email: string | null; delivery_status: string | null }

      if (recipients.length > 0) {
        const dashboardUrl = `${siteUrl}/dashboard`
        await Promise.allSettled(
          recipients.map((to) =>
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
        notified = { notified_via: 'operator', notified_email: recipients.join(', '), delivery_status: 'sent' }
      } else {
        notified = { notified_via: 'unrouted', notified_email: null, delivery_status: null }

        // Vessel contact emails are scraped data — take the first plausible one
        const vesselEmail = [vessel?.email, vessel?.contact_email]
          .map((e) => e?.trim())
          .find((e) => e && EMAIL_SHAPE.test(e))

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
            console.error('Vessel-email notification failed:', e)
          }
        }
      }

      await supabaseAdmin.from('messages').update(notified).eq('id', newId)

      // Admins hear about every message; unrouted ones arrive flagged for
      // hand-routing (and show a red badge in the admin Messages tab).
      await notifyAdmins(
        'messages',
        notified.notified_via === 'unrouted'
          ? `${scientistName} messaged ${vesselName} — needs hand-routing`
          : `${scientistName} messaged ${vesselName}`,
        notified.notified_via === 'unrouted'
          ? unroutedInquiryAdminEmail(vesselName, scientistName, affiliation, messageBody.trim(), adminUrl, vesselDetails)
          : newMessageAdminEmail(vesselName, scientistName, 'scientist', messageBody.trim(), adminUrl),
      )
    } catch (e) {
      console.error('Inquiry notification failed:', e)
    }
  })()

  return NextResponse.json({ success: true, thread_id: newId }, { status: 201 })
}
