import { supabaseAdmin } from '@/lib/supabase-admin'
import { sendEmail } from '@/lib/brevo'

export type AdminNotificationType = 'new_claim' | 'new_submission' | 'new_signup' | 'messages'

/**
 * Emails of admins subscribed to a notification type. Prefs live in
 * profiles.notification_prefs (jsonb, opt-out: missing key = subscribed;
 * {"new_claim": false} mutes that type).
 */
export async function getAdminNotifyEmails(type: AdminNotificationType): Promise<string[]> {
  const { data, error } = await supabaseAdmin
    .from('profiles')
    .select('email, notification_prefs')
    .eq('is_admin', true)
    .not('email', 'is', null)

  if (error) {
    console.error('admin-notify: failed to load admin emails:', error)
    return []
  }
  return (data ?? [])
    .filter((p) => (p.notification_prefs as Record<string, unknown> | null)?.[type] !== false)
    .map((p) => p.email as string)
    .filter(Boolean)
}

/** "+19%" / "−20%" / "n/a" when last month had nothing to compare against. */
function pctDelta(cur: number, prev: number): string {
  if (prev === 0) return 'n/a'
  const pct = Math.round(((cur - prev) / prev) * 100)
  return `${pct >= 0 ? '+' : '−'}${Math.abs(pct)}%`
}

/**
 * Monthly momentum footer appended to every admin email (get_signup_stats RPC,
 * see supabase/migrations/20260811_admin_stats_footer.sql). Any failure
 * degrades to an empty string — stats must never block a notification.
 */
export async function statsFooterHtml(): Promise<string> {
  try {
    const { data, error } = await supabaseAdmin.rpc('get_signup_stats')
    if (error || !data) {
      console.error('admin-notify: get_signup_stats failed, footer omitted:', error)
      return ''
    }
    const rows = data as { metric: string; this_month: number; last_month: number }[]
    const labels: Record<string, string> = {
      researcher_signups: 'researcher signups',
      operator_signups: 'operator signups',
      vessels_listed: 'vessels listed',
    }
    const parts = rows
      .filter((r) => labels[r.metric])
      .map((r) => {
        const cur = Number(r.this_month)
        const delta = pctDelta(cur, Number(r.last_month))
        return `<strong>${cur}</strong> ${labels[r.metric]}${delta === 'n/a' ? '' : ` <span style="color: #9ca3af;">(${delta})</span>`}`
      })
    if (parts.length === 0) return ''
    return `
      <div style="max-width: 600px; margin: 14px auto 0; padding: 0 8px; color: #6b7280; font-size: 14px; line-height: 1.6;">
        ${parts.join(' &nbsp;·&nbsp; ')}<br/>
        <span style="color: #9ca3af;">this month vs. last month</span>
      </div>`
  } catch (err) {
    console.error('admin-notify: stats footer failed:', err)
    return ''
  }
}

/** Send an email to all admins subscribed to `type`. Never throws — a
 *  notification failure must not fail the request that triggered it. */
export async function notifyAdmins(type: AdminNotificationType, subject: string, html: string) {
  try {
    const admins = await getAdminNotifyEmails(type)

    // Outside production every notification is redirected to a single dev
    // inbox, so a local or preview run can exercise the real send path —
    // footer included — without ever reaching a real admin.
    let recipients = admins
    let finalSubject = subject
    if (process.env.NODE_ENV !== 'production') {
      const devInbox = process.env.ADMIN_NOTIFY_DEV_EMAIL
      if (!devInbox) {
        console.log(
          `admin-notify [${process.env.NODE_ENV}] suppressed "${subject}" —`,
          'set ADMIN_NOTIFY_DEV_EMAIL to receive it. Real recipients:',
          admins.join(', ') || '(none)',
        )
        return
      }
      console.log(
        `admin-notify [${process.env.NODE_ENV}] redirecting "${subject}" to ${devInbox}.`,
        'Real recipients:', admins.join(', ') || '(none)',
      )
      recipients = [devInbox]
      finalSubject = `[dev] ${subject}`
    } else if (admins.length === 0) {
      console.warn('admin-notify: no recipients for', type, '— skipping', subject)
      return
    }

    // Computed once per notification, shared by every recipient.
    const footer = await statsFooterHtml()
    html += footer
    await Promise.allSettled(
      recipients.map((to) =>
        sendEmail({ to, subject: finalSubject, html }).catch((err) =>
          console.error('admin-notify: send failed for', to, err),
        ),
      ),
    )
  } catch (err) {
    console.error('admin-notify: unexpected failure:', err)
  }
}
