import { NextResponse } from 'next/server'
import { getServerUser } from '@/lib/supabase-server'
import { supabaseAdmin } from '@/lib/supabase-admin'

export async function PATCH(
  _request: Request,
  { params }: { params: { threadId: string } },
) {
  const user = await getServerUser()
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const { data: operatorProfile } = await supabaseAdmin
    .from('profiles')
    .select('role, vessel_id')
    .eq('id', user.id)
    .single()

  if (operatorProfile?.role !== 'operator') {
    return NextResponse.json({ error: 'Operator access required' }, { status: 403 })
  }

  const { threadId } = params

  const { data: root } = await supabaseAdmin
    .from('messages')
    .select('id, vessel_id, status')
    .eq('id', threadId)
    .eq('thread_id', threadId)
    .single()

  if (!root) return NextResponse.json({ error: 'Thread not found' }, { status: 404 })

  if (root.vessel_id !== operatorProfile.vessel_id) {
    return NextResponse.json({ error: 'Forbidden' }, { status: 403 })
  }

  // Only transition new → read (no-op if already read or responded)
  if (root.status === 'new') {
    await supabaseAdmin
      .from('messages')
      .update({ status: 'read' })
      .eq('id', threadId)
  }

  return NextResponse.json({ success: true })
}
