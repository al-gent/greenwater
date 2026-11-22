import { NextResponse } from 'next/server'
import { getServerUser } from '@/lib/supabase-server'
import { getSuggestedVessels } from '@/lib/suggested-vessels'

export const dynamic = 'force-dynamic'

export async function GET() {
  const user = await getServerUser()
  const headers = { 'Cache-Control': 'private, no-store' }
  if (!user) return NextResponse.json([], { status: 401, headers })
  return NextResponse.json(await getSuggestedVessels(user), { headers })
}
