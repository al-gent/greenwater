import { NextResponse } from 'next/server'
import { getServerUser } from '@/lib/supabase-server'
import { supabaseAdmin } from '@/lib/supabase-admin'
import { canOperateVessel } from '@/lib/operators'

export async function PATCH(
  _request: Request,
  { params }: { params: { threadId: string } },
) {
  const user = await getServerUser()
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const { threadId } = params

  const { data: root } = await supabaseAdmin
    .from('messages')
    .select('id, vessel_id, author_id, status')
    .eq('id', threadId)
    .eq('thread_id', threadId)
    .single()

  if (!root) return NextResponse.json({ error: 'Thread not found' }, { status: 404 })

  // Scientist side: the thread author stamps their read marker.
  if (root.author_id === user.id) {
    await supabaseAdmin
      .from('messages')
      .update({ scientist_read_at: new Date().toISOString() })
      .eq('id', threadId)
    return NextResponse.json({ success: true })
  }

  // Operator side: only transition new → read (no-op if read or responded)
  if (!(await canOperateVessel(user.id, root.vessel_id))) {
    return NextResponse.json({ error: 'Forbidden' }, { status: 403 })
  }

  if (root.status === 'new') {
    await supabaseAdmin
      .from('messages')
      .update({ status: 'read' })
      .eq('id', threadId)
  }

  return NextResponse.json({ success: true })
}
