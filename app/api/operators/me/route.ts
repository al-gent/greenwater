import { NextResponse } from 'next/server'
import { getServerUser } from '@/lib/supabase-server'
import { supabaseAdmin } from '@/lib/supabase-admin'
import { getOperatedVesselIds } from '@/lib/operators'

// Current user's operator context, for client components (Navbar, edit page).
// Single source of truth for "which vessels do I operate" — clients never
// query vessel_operators directly.
export async function GET() {
  const user = await getServerUser()
  if (!user) return NextResponse.json({ vesselIds: [], isAdmin: false })

  const [vesselIds, { data: profile }] = await Promise.all([
    getOperatedVesselIds(user.id),
    supabaseAdmin.from('profiles').select('is_admin').eq('id', user.id).single(),
  ])

  return NextResponse.json({ vesselIds, isAdmin: profile?.is_admin === true })
}
