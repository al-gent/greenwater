import { supabaseAdmin } from '@/lib/supabase-admin'

/** Operator email recipients for a vessel, minus anyone who muted the
 *  'messages' notification pref (opt-out model: missing key = subscribed). */
export async function operatorRecipients(vesselId: number): Promise<string[]> {
  const { data } = await supabaseAdmin
    .from('profiles')
    .select('email, notification_prefs')
    .eq('vessel_id', vesselId)
    .eq('role', 'operator')
  return (data ?? [])
    .filter((p) => (p.notification_prefs as Record<string, unknown> | null)?.messages !== false)
    .map((p) => p.email)
    .filter(Boolean) as string[]
}

/** True unless the user muted the 'messages' pref. */
export function wantsMessageEmails(prefs: unknown): boolean {
  return (prefs as Record<string, unknown> | null)?.messages !== false
}
