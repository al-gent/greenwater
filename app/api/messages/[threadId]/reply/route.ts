import { NextResponse } from 'next/server'
import { getServerUser } from '@/lib/supabase-server'
import { supabaseAdmin } from '@/lib/supabase-admin'
import { sendEmail, operatorReplyEmail, scientistReplyOperatorEmail, newMessageAdminEmail } from '@/lib/brevo'
import { notifyAdmins } from '@/lib/admin-notify'
import { operatorRecipients, wantsMessageEmails } from '@/lib/message-notify'
import { canOperateVessel } from '@/lib/operators'

export async function POST(
  request: Request,
  { params }: { params: { threadId: string } },
) {
  const user = await getServerUser()
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const { data: profile } = await supabaseAdmin
    .from('profiles')
    .select('first_name, last_name')
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

  // Author precedence: the thread author always replies as the inquirer side,
  // even if they also operate the vessel (self-inquiry edge case). Otherwise
  // any operator of the vessel replies on the operator side.
  const isScientist = root.author_id === user.id
  const isOperator = !isScientist && (await canOperateVessel(user.id, root.vessel_id))

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

    // Notify scientist (unless they muted platform messages) + admin feed
    ;(async () => {
      try {
        const { data: scientistProfile } = await supabaseAdmin
          .from('profiles').select('email, first_name, notification_prefs').eq('id', root.author_id).single()
        const { data: vessel } = await supabaseAdmin
          .from('vessels').select('name').eq('id', root.vessel_id).single()
        const operatorName = [profile?.first_name, profile?.last_name].filter(Boolean).join(' ') || 'The operator'
        if (scientistProfile?.email && wantsMessageEmails(scientistProfile.notification_prefs)) {
          const inboxUrl = `${process.env.NEXT_PUBLIC_SITE_URL ?? ''}/dashboard?tab=messages`
          await sendEmail({
            to: scientistProfile.email,
            subject: `New reply about ${vessel?.name ?? 'your inquiry'} — Greenwater Foundation`,
            html: operatorReplyEmail(vessel?.name ?? 'your inquiry', operatorName, body.trim(), inboxUrl),
          })
        }
        await notifyAdmins(
          'messages',
          `${operatorName} replied about ${vessel?.name ?? `vessel ${root.vessel_id}`}`,
          newMessageAdminEmail(vessel?.name ?? `vessel ${root.vessel_id}`, operatorName, 'operator', body.trim(), `${process.env.NEXT_PUBLIC_SITE_URL ?? ''}/admin`),
        )
      } catch (e) {
        console.error('Scientist notification failed:', e)
      }
    })()
  } else {
    // Scientist replied: flip the thread back to unread for the operator side
    // and email the vessel's operator(s) — previously these replies were silent.
    await supabaseAdmin.from('messages').update({ status: 'new' }).eq('id', threadId)

    ;(async () => {
      try {
        const recipients = await operatorRecipients(root.vessel_id)
        const { data: vessel } = await supabaseAdmin
          .from('vessels').select('name').eq('id', root.vessel_id).single()
        const vesselName = vessel?.name ?? 'your vessel'
        const scientistName =
          [profile?.first_name, profile?.last_name].filter(Boolean).join(' ') || 'The researcher'
        const dashboardUrl = `${process.env.NEXT_PUBLIC_SITE_URL ?? ''}/dashboard`
        await Promise.allSettled(
          recipients.map((to) =>
            sendEmail({
              to,
              subject: `New reply about ${vesselName} — Greenwater Foundation`,
              html: scientistReplyOperatorEmail(vesselName, scientistName, body.trim(), dashboardUrl),
            }).catch((e) => console.error('Operator reply notification failed for', to, e)),
          ),
        )
        await notifyAdmins(
          'messages',
          `${scientistName} replied about ${vesselName}`,
          newMessageAdminEmail(vesselName, scientistName, 'scientist', body.trim(), `${process.env.NEXT_PUBLIC_SITE_URL ?? ''}/admin`),
        )
      } catch (e) {
        console.error('Operator reply notification failed:', e)
      }
    })()
  }

  return NextResponse.json({ success: true, message: reply })
}
