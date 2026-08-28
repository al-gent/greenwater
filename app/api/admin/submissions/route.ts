import { NextResponse } from 'next/server'
import { createServerSupabaseClient } from '@/lib/supabase-server'
import { supabaseAdmin, supabaseAdminAs } from '@/lib/supabase-admin'
import { sendEmail, submissionApprovedEmail, submissionRejectedEmail } from '@/lib/brevo'

async function checkAdmin() {
  const supabase = createServerSupabaseClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return null

  const { data: profile } = await supabaseAdmin
    .from('profiles')
    .select('is_admin')
    .eq('id', user.id)
    .single()

  return profile?.is_admin === true ? user : null
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

  const db = supabaseAdminAs(admin.email ?? admin.id)

  // Fetch the submission first so we have email + names
  const { data: submission, error: fetchError } = await supabaseAdmin
    .from('vessel_submissions')
    .select('*')
    .eq('id', id)
    .single()

  if (fetchError || !submission) {
    return NextResponse.json({ error: 'Submission not found' }, { status: 404 })
  }

  const { error } = await db
    .from('vessel_submissions')
    .update({ status, admin_notes: admin_notes ?? null, reviewed_at: new Date().toISOString() })
    .eq('id', id)

  if (error) return NextResponse.json({ error: error.message }, { status: 500 })

  // On approval: insert a new row into vessels
  if (status === 'approved') {
    const { data: newVessel, error: insertError } = await supabaseAdmin.from('vessels').insert({
      name: submission.vessel_name,
      operator_name: submission.operator_name,
      port_name: submission.port_name ?? null,
      port_city: submission.port_city,
      port_state: submission.port_state ?? null,
      country: submission.country ?? null,
      // vessels stores homeport coords in the (text) primary_* columns
      primary_latitude: submission.homeport_latitude != null ? String(submission.homeport_latitude) : null,
      primary_longitude: submission.homeport_longitude != null ? String(submission.homeport_longitude) : null,
      operating_area_geojson: submission.operating_area_geojson ?? null,
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
      vessel_of_opportunity: submission.vessel_of_opportunity ?? null,
      daily_rate: submission.daily_rate ?? null,
      daily_rate_currency: submission.daily_rate_currency ?? null,
      photo_urls: submission.photo_urls?.length ? submission.photo_urls : null,
      last_updated: new Date().toISOString(), // created_at defaults in the DB
    }).select('id').single()

    if (insertError || !newVessel) {
      console.error('vessel insert error on approval:', insertError)
      // Roll back the status update
      await db
        .from('vessel_submissions')
        .update({ status: 'pending', admin_notes: null, reviewed_at: null })
        .eq('id', id)
      return NextResponse.json({ error: 'Failed to add vessel to database. Approval was not saved.' }, { status: 500 })
    }

    // Move staged photos out of submissions/<draftId>/ — the applicant keeps
    // owner-delete rights on staging paths, so a live vessel must not point
    // there. Copy each file (+ its thumb) to <vesselId>/ and rewrite the URLs;
    // on a copy failure keep the staging URL rather than lose the photo.
    if (submission.photo_urls?.length) {
      const bucketPrefix = `${process.env.NEXT_PUBLIC_SUPABASE_URL}/storage/v1/object/public/vessel-photos/`
      const movedUrls: string[] = []
      const urlMap = new Map<string, string>() // staging URL → final URL (for credit remapping)
      for (const url of submission.photo_urls as string[]) {
        const stagingPath = url.startsWith(bucketPrefix) ? url.slice(bucketPrefix.length) : null
        const fileName = stagingPath?.split('/').pop()
        if (!stagingPath || !fileName) {
          movedUrls.push(url)
          urlMap.set(url, url)
          continue
        }
        const destPath = `${newVessel.id}/${fileName}`
        const { error: copyError } = await supabaseAdmin.storage
          .from('vessel-photos')
          .copy(stagingPath, destPath)
        if (copyError && !/already exists/i.test(copyError.message)) {
          console.error(`photo copy failed for ${stagingPath}:`, copyError.message)
          movedUrls.push(url)
          urlMap.set(url, url)
          continue
        }
        // thumbnail is best-effort — cards fall back to the original without it
        await supabaseAdmin.storage
          .from('vessel-photos')
          .copy(`thumbs/${stagingPath}`, `thumbs/${destPath}`)
          .catch(() => {})
        movedUrls.push(bucketPrefix + destPath)
        urlMap.set(url, bucketPrefix + destPath)
      }
      // Carry per-photo credits + provenance over, re-keyed to the moved URLs
      const photoDetails = Array.isArray(submission.photo_details)
        ? (submission.photo_details as { url: string; credit?: string }[])
            .map((d) => ({ ...d, url: urlMap.get(d.url) ?? d.url }))
            .filter((d) => movedUrls.includes(d.url))
        : []
      await supabaseAdmin
        .from('vessels')
        .update({ photo_urls: movedUrls, photo_details: photoDetails.length ? photoDetails : null })
        .eq('id', newVessel.id) // still supabaseAdmin: photo-move bookkeeping, not an admin edit
    }

    // Grant the submitter a vessel_operators membership for the new vessel.
    // No role writes — works identically for scientists and admins.
    if (submission.user_id) {
      const { error: membershipError } = await db
        .from('vessel_operators')
        .upsert(
          // Admin approval creates this membership, so it's born confirmed.
          { user_id: submission.user_id, vessel_id: newVessel.id, status: 'active', confirmed_at: new Date().toISOString() },
          { onConflict: 'user_id,vessel_id', ignoreDuplicates: true },
        )
      if (membershipError) {
        console.error('Failed to grant membership on submission approval:', membershipError)
        // Vessel is already created; surface the error but don't roll back the vessel.
      }
      // Approval = vetting (see claims route)
      await db.from('profiles').update({ verified: true }).eq('id', submission.user_id)
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
