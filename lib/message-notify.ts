import { getVesselOperators } from '@/lib/operators'

/** Operator email recipients for a vessel, minus anyone who muted the
 *  'messages' notification pref (opt-out model: missing key = subscribed).
 *  Operators come from vessel_operators membership, not profiles.role. */
export async function operatorRecipients(vesselId: number): Promise<string[]> {
  const operators = await getVesselOperators(vesselId)
  return operators
    .filter((p) => wantsMessageEmails(p.notification_prefs))
    .map((p) => p.email)
    .filter(Boolean) as string[]
}

/** True unless the user muted the 'messages' pref. */
export function wantsMessageEmails(prefs: unknown): boolean {
  return (prefs as Record<string, unknown> | null)?.messages !== false
}
