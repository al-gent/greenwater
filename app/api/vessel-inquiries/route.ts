import { NextResponse } from 'next/server'
import { supabase } from '@/lib/supabase'

export async function POST(request: Request) {
  let body: Record<string, unknown>
  try {
    body = await request.json()
  } catch {
    return NextResponse.json({ error: 'Invalid JSON' }, { status: 400 })
  }

  const {
    vessel_id,
    vessel_name,
    scientist_name,
    scientist_email,
    institution,
    start_date,
    end_date,
    message,
  } = body as Record<string, string>

  if (!vessel_id || !scientist_name?.trim() || !scientist_email?.trim() || !institution?.trim() || !message?.trim()) {
    return NextResponse.json({ error: 'Required fields are missing.' }, { status: 400 })
  }

  if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(scientist_email)) {
    return NextResponse.json({ error: 'Invalid email address.' }, { status: 400 })
  }

  const { error } = await supabase.from('vessel_inquiries').insert({
    vessel_id: parseInt(String(vessel_id), 10),
    vessel_name: vessel_name?.trim() ?? '',
    scientist_name: scientist_name.trim(),
    scientist_email: scientist_email.trim().toLowerCase(),
    institution: institution.trim(),
    start_date: start_date || null,
    end_date: end_date || null,
    message: message.trim(),
  })

  if (error) {
    console.error('vessel_inquiries insert error:', error)
    return NextResponse.json({ error: 'Failed to send message. Please try again.' }, { status: 500 })
  }

  return NextResponse.json({ success: true }, { status: 201 })
}
