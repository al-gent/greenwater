import { NextRequest, NextResponse } from 'next/server'

export async function POST(request: NextRequest) {
  const apiKey = process.env.BREVO_API_KEY
  const fromEmail = process.env.BREVO_FROM_EMAIL ?? 'noreply@greenwaterfoundation.org'

  if (!apiKey) {
    return NextResponse.json({ error: 'BREVO_API_KEY is not set' }, { status: 500 })
  }

  const { to } = await request.json()

  const res = await fetch('https://api.brevo.com/v3/smtp/email', {
    method: 'POST',
    headers: { 'api-key': apiKey, 'Content-Type': 'application/json' },
    body: JSON.stringify({
      sender: { name: 'Greenwater Foundation', email: fromEmail },
      to: [{ email: to }],
      subject: 'Greenwater email test',
      htmlContent: '<p>Test email from production.</p>',
    }),
  })

  const body = await res.text()
  return NextResponse.json({ status: res.status, body, fromEmail })
}
