import { supabaseAdmin } from '@/lib/supabase-admin'
import { sendEmail } from '@/lib/brevo'

export type AdminNotificationType = 'new_claim' | 'new_submission' | 'new_signup'

/**
 * Emails of admins subscribed to a notification type. Prefs live in
 * profiles.notification_prefs (jsonb, opt-out: missing key = subscribed;
 * {"new_claim": false} mutes that type).
 */
export async function getAdminNotifyEmails(type: AdminNotificationType): Promise<string[]> {
  const { data, error } = await supabaseAdmin
    .from('profiles')
    .select('email, notification_prefs')
    .eq('role', 'admin')
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

/** Send an email to all admins subscribed to `type`. Never throws — a
 *  notification failure must not fail the request that triggered it. */
export async function notifyAdmins(type: AdminNotificationType, subject: string, html: string) {
  try {
    const emails = await getAdminNotifyEmails(type)
    if (emails.length === 0) {
      console.warn('admin-notify: no recipients for', type, '— skipping', subject)
      return
    }
    await Promise.allSettled(
      emails.map((to) =>
        sendEmail({ to, subject, html }).catch((err) =>
          console.error('admin-notify: send failed for', to, err),
        ),
      ),
    )
  } catch (err) {
    console.error('admin-notify: unexpected failure:', err)
  }
}
