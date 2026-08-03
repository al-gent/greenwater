import { NextResponse } from 'next/server'
import { getServerUser } from '@/lib/supabase-server'
import { supabaseAdmin } from '@/lib/supabase-admin'

// Unread-thread count for the navbar badge. The counting lives in the
// message_unread_count RPC: operator → 'new' threads on their vessel,
// scientist → own threads with operator messages newer than scientist_read_at.
export async function GET() {
  const user = await getServerUser()
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const { data, error } = await supabaseAdmin.rpc('message_unread_count', { p_user_id: user.id })
  if (error) {
    console.error('[messages/unread-count]', error.message)
    return NextResponse.json({ count: 0 })
  }
  return NextResponse.json({ count: data ?? 0 })
}
