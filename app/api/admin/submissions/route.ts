import { NextResponse } from 'next/server'
import { createServerSupabaseClient } from '@/lib/supabase-server'
import { supabaseAdmin } from '@/lib/supabase-admin'
import { sendEmail, submissionApprovedEmail, submissionRejectedEmail } from '@/lib/brevo'

async function checkAdmin() {
  const supabase = createServerSupabaseClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return null

  const { data: profile } = await supabaseAdmin
    .from('profiles')
    .select('role')
    .eq('id', user.id)
    .single()

  return profile?.role === 'admin' ? user : null
}

export async function GET() {
  const admin = await checkAdmin()
  if (!admin) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const { data, error } = await supabaseAdmin
    .from('vessel_submissions')
    .select('*')
    .order('created_at', { ascending: false })

  if (error) return NextResponse.json({ error: error.message }, { status: 500 })
  return NextResponse.json(data)
}

export async function PATCH(request: Request) {
  const admin = await checkAdmin()
  if (!admin) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const { id, status, admin_notes } = await request.json()

  if (!id || !['approved', 'rejected'].includes(status)) {
    return NextResponse.json({ error: 'Invalid payload' }, { status: 400 })
  }

  // Fetch the submission first so we have email + names
  const { data: submission, error: fetchError } = await supabaseAdmin
    .from('vessel_submissions')
    .select('*')
    .eq('id', id)
    .single()

  if (fetchError || !submission) {
    return NextResponse.json({ error: 'Submission not found' }, { status: 404 })
  }

  const { error } = await supabaseAdmin
    .from('vessel_submissions')
    .update({ status, admin_notes: admin_notes ?? null, reviewed_at: new Date().toISOString() })
    .eq('id', id)

  if (error) return NextResponse.json({ error: error.message }, { status: 500 })

  // On approval: insert a new row into vessels
  if (status === 'approved') {
    const homeport = submission.port_state
      ? `${submission.port_city}, ${submission.port_state}`
      : submission.port_city

    const { error: insertError } = await supabaseAdmin.from('vessels').insert({
      name: submission.vessel_name,
      operator_name: submission.operator_name,
      homeport,
      port_city: submission.port_city,
      port_state: submission.port_state ?? null,
      country: submission.country ?? null,
      mmsi: submission.mmsi ?? null,
      imo_number: submission.imo_number ?? null,
      call_sign: submission.call_sign ?? null,
      year_built: submission.year_built ?? null,
      year_refit: submission.year_refit ?? null,
      length: submission.length_m ?? null,
      beam: submission.beam_m ?? null,
      draft: submission.draft_m ?? null,
      speed_cruise: submission.speed_cruise ?? null,
      speed_max: submission.speed_max ?? null,
      scientists: submission.scientists ?? null,
      crew: submission.crew ?? null,
      endurance: submission.endurance ?? null,
      main_activity: submission.main_activity ?? null,
      operating_area: submission.operating_area ?? null,
      dpos: submission.dpos ?? null,
      ice_breaking: submission.ice_breaking ?? null,
      url_ship: submission.url_ship ?? null,
    })

    if (insertError) {
      console.error('vessel insert error on approval:', insertError)
      // Roll back the status update
      await supabaseAdmin
        .from('vessel_submissions')
        .update({ status: 'pending', admin_notes: null, reviewed_at: null })
        .eq('id', id)
      return NextResponse.json({ error: 'Failed to add vessel to database. Approval was not saved.' }, { status: 500 })
    }
  }

  // Send Brevo email
  try {
    if (status === 'approved') {
      await sendEmail({
        to: submission.email,
        subject: `Your vessel listing has been approved — Greenwater Foundation`,
        html: submissionApprovedEmail(submission.vessel_name, submission.operator_name),
      })
    } else {
      await sendEmail({
        to: submission.email,
        subject: `Update on your vessel listing application — Greenwater Foundation`,
        html: submissionRejectedEmail(submission.vessel_name, admin_notes ?? ''),
      })
    }
  } catch (e) {
    console.error('Brevo email error:', e)
    // Don't fail the request if email fails
  }

  return NextResponse.json({ success: true })
}
