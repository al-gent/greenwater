import { NextResponse } from 'next/server'
import { getServerUser } from '@/lib/supabase-server'
import { supabaseAdmin } from '@/lib/supabase-admin'
import { sendEmail, newInquiryOperatorEmail } from '@/lib/brevo'

export async function POST(request: Request) {
  const user = await getServerUser()
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const { data: profile } = await supabaseAdmin
    .from('profiles')
    .select('verified, first_name, last_name, institution, title')
    .eq('id', user.id)
    .single()

  if (!profile?.verified) {
    return NextResponse.json({ error: 'Account not yet verified' }, { status: 403 })
  }

  const body = await request.json()
  const { vessel_id, body: messageBody, start_date, end_date } = body

  if (!vessel_id || !messageBody?.trim()) {
    return NextResponse.json({ error: 'vessel_id and body are required' }, { status: 400 })
  }

  const newId = crypto.randomUUID()
  const { error: insertError } = await supabaseAdmin.from('messages').insert({
    id: newId,
    thread_id: newId,
    vessel_id,
    author_id: user.id,
    author_role: 'scientist',
    body: messageBody.trim(),
    start_date: start_date ?? null,
    end_date: end_date ?? null,
    status: 'new',
  })

  if (insertError) {
    console.error('Message insert error:', insertError)
    return NextResponse.json({ error: insertError.message }, { status: 500 })
  }

  // Notify operator in background — never fail the insert
  ;(async () => {
    try {
      const { data: vessel } = await supabaseAdmin
        .from('vessels')
        .select('name')
        .eq('id', vessel_id)
        .single()

      const { data: operatorProfile } = await supabaseAdmin
        .from('profiles')
        .select('email, first_name, last_name')
        .eq('vessel_id', vessel_id)
        .eq('role', 'operator')
        .single()

      if (operatorProfile?.email) {
        const dashboardUrl = `${process.env.NEXT_PUBLIC_SITE_URL ?? ''}/dashboard`
        await sendEmail({
          to: operatorProfile.email,
          subject: `New inquiry for ${vessel?.name ?? 'your vessel'} — Greenwater Foundation`,
          html: newInquiryOperatorEmail(
            profile.first_name ?? '',
            profile.last_name ?? '',
            profile.institution ?? '',
            profile.title ?? '',
            vessel?.name ?? 'your vessel',
            messageBody.trim(),
            dashboardUrl,
          ),
        })
      }
    } catch (e) {
      console.error('Operator notification failed:', e)
    }
  })()

  return NextResponse.json({ success: true, thread_id: newId }, { status: 201 })
}
