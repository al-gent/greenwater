import { NextRequest, NextResponse } from 'next/server'
import { supabaseAdmin } from '@/lib/supabase-admin'
import { sendEmail, migrationWelcomeEmail } from '@/lib/brevo'

function isAuthorized(request: NextRequest): boolean {
  const auth = request.headers.get('authorization') ?? ''
  const token = auth.startsWith('Bearer ') ? auth.slice(7) : ''
  return token === process.env.MIGRATION_API_SECRET
}


interface UserPayload {
  id: number
  status: string
  firstName: string
  lastName: string
  email: string
  shipIds: number[]
}

function isValidPayload(body: unknown): body is UserPayload {
  if (!body || typeof body !== 'object') return false
  const b = body as Record<string, unknown>
  return (
    typeof b.id === 'number' &&
    typeof b.status === 'string' &&
    typeof b.firstName === 'string' &&
    typeof b.lastName === 'string' &&
    typeof b.email === 'string' &&
    Array.isArray(b.shipIds) &&
    b.shipIds.every((s) => typeof s === 'number')
  )
}

export async function POST(request: NextRequest) {
  if (!isAuthorized(request)) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }

  let body: unknown
  try {
    body = await request.json()
  } catch {
    return NextResponse.json({ error: 'Invalid JSON' }, { status: 400 })
  }

  if (!isValidPayload(body)) {
    return NextResponse.json(
      { error: 'Invalid payload. Expected: { id, status, firstName, lastName, email, shipIds }' },
      { status: 400 }
    )
  }

  // Check for duplicate by external_id
  const { data: existing } = await supabaseAdmin
    .from('user_migrations')
    .select('id')
    .eq('external_id', body.id)
    .single()

  if (existing) {
    return NextResponse.json({ error: 'User already queued for migration', id: body.id }, { status: 409 })
  }

  // Insert migration record
  const { data: migrationRow, error: insertError } = await supabaseAdmin
    .from('user_migrations')
    .insert({
      external_id: body.id,
      status: body.status,
      first_name: body.firstName,
      last_name: body.lastName,
      email: body.email,
      ship_ids: body.shipIds,
      migration_status: 'pending',
    })
    .select('id')
    .single()

  if (insertError) {
    console.error('user_migrations insert error:', insertError)
    return NextResponse.json({ error: 'Failed to store user.' }, { status: 500 })
  }

  // Create Supabase auth user (or look up existing)
  let supabaseUserId: string
  const { data: authData, error: authError } = await supabaseAdmin.auth.admin.createUser({
    email: body.email,
    email_confirm: true,
    user_metadata: { first_name: body.firstName, last_name: body.lastName },
  })

  if (authError) {
    if (authError.message.includes('already been registered')) {
      // User exists — look them up
      const { data: userList } = await supabaseAdmin.auth.admin.listUsers()
      const existingUser = userList?.users.find((u) => u.email === body.email)
      if (!existingUser) {
        await supabaseAdmin
          .from('user_migrations')
          .update({ migration_status: 'failed', migration_error: authError.message })
          .eq('id', migrationRow.id)
        return NextResponse.json({ error: 'Failed to create auth user.', detail: authError.message }, { status: 500 })
      }
      supabaseUserId = existingUser.id
    } else {
      await supabaseAdmin
        .from('user_migrations')
        .update({ migration_status: 'failed', migration_error: authError.message })
        .eq('id', migrationRow.id)
      console.error('createUser error:', authError)
      return NextResponse.json({ error: 'Failed to create auth user.', detail: authError.message }, { status: 500 })
    }
  } else {
    supabaseUserId = authData.user.id
  }

  // Generate password setup link
  const { data: linkData, error: linkError } = await supabaseAdmin.auth.admin.generateLink({
    type: 'recovery',
    email: body.email,
  })

  if (linkError || !linkData?.properties?.action_link) {
    await supabaseAdmin
      .from('user_migrations')
      .update({ migration_status: 'failed', migration_error: linkError?.message ?? 'No link generated' })
      .eq('id', migrationRow.id)
    console.error('generateLink error:', linkError)
    return NextResponse.json({ error: 'Failed to generate setup link.' }, { status: 500 })
  }

  // Send welcome email
  try {
    await sendEmail({
      to: body.email,
      subject: 'Set up your Greenwater Foundation account',
      html: migrationWelcomeEmail(body.firstName, linkData.properties.action_link),
    })
  } catch (emailError) {
    const detail = emailError instanceof Error ? emailError.message : String(emailError)
    await supabaseAdmin
      .from('user_migrations')
      .update({ migration_status: 'failed', migration_error: `Email failed: ${detail}` })
      .eq('id', migrationRow.id)
    return NextResponse.json({ error: 'Failed to send email.', detail }, { status: 500 })
  }

  // Mark migration complete
  await supabaseAdmin
    .from('user_migrations')
    .update({
      migration_status: 'done',
      supabase_user_id: supabaseUserId,
      migrated_at: new Date().toISOString(),
    })
    .eq('id', migrationRow.id)

  return NextResponse.json({ success: true, email: body.email }, { status: 201 })
}
