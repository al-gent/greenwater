import { NextRequest, NextResponse } from 'next/server'

const DC = 'us7'

export async function POST(req: NextRequest) {
  const { email, fname, lname } = await req.json()

  if (!email || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
    return NextResponse.json({ error: 'Valid email required.' }, { status: 400 })
  }

  const audienceId = process.env.MAILCHIMP_AUDIENCE_ID
  const apiKey = process.env.MAILCHIMP_API_KEY

  if (!audienceId || !apiKey) {
    return NextResponse.json({ error: 'Newsletter not configured.' }, { status: 500 })
  }

  const res = await fetch(
    `https://${DC}.api.mailchimp.com/3.0/lists/${audienceId}/members`,
    {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Basic ${Buffer.from(`anystring:${apiKey}`).toString('base64')}`,
      },
      body: JSON.stringify({
        email_address: email,
        status: 'subscribed',
        merge_fields: { FNAME: fname ?? '', LNAME: lname ?? '' },
      }),
    }
  )

  if (res.ok) {
    return NextResponse.json({ success: true })
  }

  const data = await res.json()
  if (data.title === 'Member Exists') {
    return NextResponse.json({ error: 'You are already subscribed.' }, { status: 400 })
  }

  return NextResponse.json({ error: 'Something went wrong. Please try again.' }, { status: 500 })
}
