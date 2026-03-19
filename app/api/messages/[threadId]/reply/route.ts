import { NextResponse } from 'next/server'
import { getServerUser } from '@/lib/supabase-server'
import { supabaseAdmin } from '@/lib/supabase-admin'
import { sendEmail, operatorReplyEmail } from '@/lib/brevo'

export async function POST(
  request: Request,
  { params }: { params: { threadId: string } },
) {
  const user = await getServerUser()
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const { data: profile } = await supabaseAdmin
    .from('profiles')
    .select('role, vessel_id, first_name, last_name')
    .eq('id', user.id)
    .single()

  const { threadId } = params
  const { body } = await request.json()

  if (!body?.trim()) {
    return NextResponse.json({ error: 'body is required' }, { status: 400 })
  }

  // Fetch root message
  const { data: root } = await supabaseAdmin
    .from('messages')
    .select('*')
    .eq('id', threadId)
    .eq('thread_id', threadId)
    .single()

  if (!root) return NextResponse.json({ error: 'Thread not found' }, { status: 404 })

  const isOperator = profile?.role === 'operator' && root.vessel_id === profile?.vessel_id
  const isScientist = root.author_id === user.id

  if (!isOperator && !isScientist) {
    return NextResponse.json({ error: 'Forbidden' }, { status: 403 })
  }

  const authorRole = isOperator ? 'operator' : 'scientist'

  const { data: reply, error: replyError } = await supabaseAdmin
    .from('messages')
    .insert({
      thread_id: threadId,
      vessel_id: root.vessel_id,
      author_id: user.id,
      author_role: authorRole,
      body: body.trim(),
    })
    .select()
    .single()

  if (replyError) {
    console.error('Reply insert error:', replyError)
    return NextResponse.json({ error: replyError.message }, { status: 500 })
  }

  // Update root status
  if (isOperator) {
    await supabaseAdmin.from('messages').update({ status: 'responded' }).eq('id', threadId)

    // Notify scientist
    ;(async () => {
      try {
        const { data: scientistProfile } = await supabaseAdmin
          .from('profiles').select('email, first_name').eq('id', root.author_id).single()
        const { data: vessel } = await supabaseAdmin
          .from('vessels').select('name').eq('id', root.vessel_id).single()
        if (scientistProfile?.email) {
          const inboxUrl = `${process.env.NEXT_PUBLIC_SITE_URL ?? ''}/inbox`
          const operatorName = [profile.first_name, profile.last_name].filter(Boolean).join(' ') || 'The operator'
          await sendEmail({
            to: scientistProfile.email,
            subject: `New reply about ${vessel?.name ?? 'your inquiry'} — Greenwater Foundation`,
            html: operatorReplyEmail(vessel?.name ?? 'your inquiry', operatorName, body.trim(), inboxUrl),
          })
        }
      } catch (e) {
        console.error('Scientist notification failed:', e)
      }
    })()
  }

  return NextResponse.json({ success: true, message: reply })
}
