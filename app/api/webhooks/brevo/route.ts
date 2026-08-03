import { NextRequest, NextResponse } from 'next/server'
import { supabaseAdmin } from '@/lib/supabase-admin'

// Brevo transactional webhook → records delivery outcomes on message threads.
// Configure in Brevo (Transactional → Settings → Webhooks) pointing at
//   https://vesselconnect.org/api/webhooks/brevo?token=<BREVO_WEBHOOK_SECRET>
// for the events: delivered, soft bounce, hard bounce, blocked, spam.
//
// Sends that should be tracked carry a `inquiry-<threadId>` tag (see
// /api/messages); everything else is acknowledged and ignored.

const EVENT_TO_STATUS: Record<string, string> = {
  delivered: 'delivered',
  soft_bounce: 'bounced',
  hard_bounce: 'bounced',
  blocked: 'blocked',
  spam: 'spam',
  invalid_email: 'bounced',
  error: 'bounced',
}

export async function POST(request: NextRequest) {
  const secret = process.env.BREVO_WEBHOOK_SECRET
  if (!secret || request.nextUrl.searchParams.get('token') !== secret) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }

  let event: { event?: string; tags?: string[]; tag?: string; email?: string }
  try {
    event = await request.json()
  } catch {
    return NextResponse.json({ error: 'Invalid JSON' }, { status: 400 })
  }

  const status = EVENT_TO_STATUS[event.event ?? '']
  // Brevo sends tags as `tags: string[]` or legacy `tag: "a,b"` depending on path
  const tags = event.tags ?? (event.tag ? event.tag.split(',') : [])
  const threadId = tags.map((t) => t.match(/^inquiry-([0-9a-f-]{36})$/i)?.[1]).find(Boolean)

  if (status && threadId) {
    const { error } = await supabaseAdmin
      .from('messages')
      .update({ delivery_status: status })
      .eq('id', threadId)
      .eq('thread_id', threadId)
    if (error) console.error('[webhooks/brevo]', error.message)
  }

  // Always 200 — Brevo retries and eventually disables the webhook on errors
  return NextResponse.json({ ok: true })
}
