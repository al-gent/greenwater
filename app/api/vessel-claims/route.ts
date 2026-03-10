import { NextResponse } from 'next/server'
import { createServerSupabaseClient } from '@/lib/supabase-server'
import { supabaseAdmin } from '@/lib/supabase-admin'

export async function POST(request: Request) {
  // Require authentication
  const serverClient = createServerSupabaseClient()
  const { data: { user } } = await serverClient.auth.getUser()

  if (!user) {
    return NextResponse.json({ error: 'You must be signed in to claim a vessel.' }, { status: 401 })
  }

  let body: Record<string, unknown>
  try {
    body = await request.json()
  } catch {
    return NextResponse.json({ error: 'Invalid JSON' }, { status: 400 })
  }

  const { vessel_id, vessel_name, claimant_name, email, role, organization, message } =
    body as Record<string, string>

  if (!vessel_id || !vessel_name?.trim() || !claimant_name?.trim() || !email?.trim() || !role?.trim() || !organization?.trim()) {
    return NextResponse.json({ error: 'All required fields must be filled.' }, { status: 400 })
  }

  if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
    return NextResponse.json({ error: 'Invalid email address.' }, { status: 400 })
  }

  const { error } = await supabaseAdmin.from('vessel_claims').insert({
    vessel_id: parseInt(String(vessel_id), 10),
    vessel_name: vessel_name.trim(),
    user_id: user.id,
    claimant_name: claimant_name.trim(),
    email: email.trim().toLowerCase(),
    role: role.trim(),
    organization: organization.trim(),
    message: message?.trim() ?? null,
  })

  if (error) {
    console.error('vessel_claims insert error:', error)
    return NextResponse.json({ error: 'Failed to submit claim. Please try again.' }, { status: 500 })
  }

  return NextResponse.json({ success: true }, { status: 201 })
}
