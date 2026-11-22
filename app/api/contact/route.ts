import { NextResponse } from 'next/server'
import { sendEmail } from '@/lib/brevo'

export async function POST(request: Request) {
  if (request.headers.get('content-type')?.split(';')[0].trim() !== 'application/json') {
    return NextResponse.json({ error: 'Expected a JSON message.' }, { status: 415 })
  }
  const body = await request.json().catch(() => null)
  const email = typeof body?.email === 'string' ? body.email.trim() : ''
  const question = typeof body?.question === 'string' ? body.question.trim() : ''
  if (body?.website) return NextResponse.json({ success: true })
  if (email.length > 254 || !/^[^\s@<>]+@[^\s@<>]+\.[^\s@<>]+$/.test(email)) {
    return NextResponse.json({ error: 'Enter a valid email address so we can reply.' }, { status: 400 })
  }
  if (!question || question.length > 4000) {
    return NextResponse.json({ error: 'Enter a question of up to 4,000 characters.' }, { status: 400 })
  }

  try {
    const sent = await sendEmail({
      to: ['dev@greenwaterfoundation.org', 'info@greenwaterfoundation.org'],
      replyTo: email,
      subject: 'Question from the Vessel Connect website',
      text: `From: ${email}\n\n${question}`,
    })
    if (sent) return NextResponse.json({ success: true })
  } catch {
    console.error('Contact form email could not be sent')
  }
  return NextResponse.json({ error: 'We couldn’t send your question. Please try again later.' }, { status: 503 })
}
