import 'server-only'
import type { User } from '@supabase/supabase-js'
import { getReadOnlyDb } from './read-only-db'

export async function getSuggestedVessels(user: Pick<User, 'id' | 'email' | 'email_confirmed_at'>) {
  const email = user.email?.trim().toLowerCase()
  if (!user.email_confirmed_at || !email) return []

  try {
    const sql = await getReadOnlyDb()
    // Imported listing fields sometimes contain a contact list or Name <address>.
    return await sql<{ id: number; name: string }[]>`
      select v.id, v.name from public.vessels v
      where v.status = 'active' and exists (
        select from regexp_split_to_table(concat_ws(';', v.email, v.contact_email), '[,;]') as part(address)
        where lower(btrim(coalesce(substring(part.address from '<([^<>]+)>'), part.address))) = ${email}
      ) and not exists (
        select from public.vessel_operators o where o.user_id = ${user.id} and o.vessel_id = v.id
      )
      order by v.name, v.id
    `
  } catch {
    // Suggestions are optional. A lookup failure must not block the dashboard or manual claims.
    console.error('Could not load suggested vessel claims')
    return []
  }
}
