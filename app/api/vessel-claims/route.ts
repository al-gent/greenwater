import { NextResponse } from 'next/server'
import { createServerSupabaseClient } from '@/lib/supabase-server'
import { supabaseAdmin } from '@/lib/supabase-admin'

export async function POST(request: Request) {
  const serverClient = createServerSupabaseClient()
  const { data: { user } } = await serverClient.auth.getUser()

  if (!user) {
    return NextResponse.json({ error: 'You must be signed in to claim a vessel.' }, { status: 401 })
  }

  // Pull identity from profile — not from request body
  const { data: profile } = await supabaseAdmin
    .from('profiles')
    .select('first_name, last_name, institution, title, email')
    .eq('id', user.id)
    .single()

  let body: Record<string, unknown>
  try {
    body = await request.json()
  } catch {
    return NextResponse.json({ error: 'Invalid JSON' }, { status: 400 })
  }

  const { vessel_id, vessel_name, message, document_url } = body as Record<string, string>

  if (!vessel_id || !vessel_name?.trim() || !message?.trim()) {
    return NextResponse.json({ error: 'vessel_id, vessel_name, and message are required.' }, { status: 400 })
  }

  const claimantName = [profile?.first_name, profile?.last_name].filter(Boolean).join(' ') || 'Unknown'
  const email = profile?.email ?? user.email ?? ''

  const { error } = await supabaseAdmin.from('vessel_claims').insert({
    vessel_id: parseInt(String(vessel_id), 10),
    vessel_name: vessel_name.trim(),
    user_id: user.id,
    claimant_name: claimantName,
    email,
    role: profile?.title ?? '',
    organization: profile?.institution ?? '',
    message: message.trim(),
    document_url: document_url ?? null,
  })

  if (error) {
    console.error('vessel_claims insert error:', error)
    return NextResponse.json({ error: 'Failed to submit claim. Please try again.' }, { status: 500 })
  }

  return NextResponse.json({ success: true }, { status: 201 })
}
