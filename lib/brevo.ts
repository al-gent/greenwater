interface EmailOptions {
  to: string
  subject: string
  html: string
}

export async function sendEmail({ to, subject, html }: EmailOptions) {
  const apiKey = process.env.BREVO_API_KEY
  const fromEmail = process.env.BREVO_FROM_EMAIL ?? 'noreply@greenwaterfoundation.org'
  if (!apiKey) {
    console.warn('BREVO_API_KEY not set — skipping email to', to)
    return
  }
  const res = await fetch('https://api.brevo.com/v3/smtp/email', {
    method: 'POST',
    headers: {
      'api-key': apiKey,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({
      sender: { name: 'Greenwater Foundation', email: fromEmail },
      to: [{ email: to }],
      subject,
      htmlContent: html,
    }),
  })
  if (!res.ok) {
    const text = await res.text()
    console.error('Brevo email failed:', res.status, text)
    throw new Error(`Brevo error ${res.status}: ${text}`)
  }
}

// ── Email templates ──────────────────────────────────────────────────────────

const base = (body: string) => `
<div style="font-family: Inter, Arial, sans-serif; max-width: 600px; margin: 0 auto; color: #1a1a1a;">
  <div style="background: #1B3A6B; padding: 24px 32px;">
    <span style="color: white; font-size: 20px; font-weight: 700;">Greenwater Foundation</span>
  </div>
  <div style="padding: 32px;">
    ${body}
    <hr style="border: none; border-top: 1px solid #eee; margin: 32px 0;" />
    <p style="color: #999; font-size: 12px;">
      © ${new Date().getFullYear()} Greenwater Foundation. Connecting marine scientists with research vessels worldwide.
    </p>
  </div>
</div>
`

export function submissionApprovedEmail(vesselName: string, operatorName: string) {
  return base(`
    <h2 style="color: #1B3A6B; margin-top: 0;">Your vessel listing has been approved!</h2>
    <p>Hi ${operatorName},</p>
    <p>
      Great news — your application to list <strong>${vesselName}</strong> on the Greenwater Foundation
      marketplace has been reviewed and approved.
    </p>
    <p>Your vessel is now live and visible to marine scientists worldwide.</p>
    <p>
      <a href="${process.env.NEXT_PUBLIC_SITE_URL}" style="background: #2A7B6F; color: white; padding: 12px 24px; border-radius: 24px; text-decoration: none; font-weight: 600; display: inline-block; margin-top: 8px;">
        Visit Greenwater
      </a>
    </p>
    <p style="color: #666; margin-top: 24px;">
      If you have any questions, reply to this email and our team will be in touch.
    </p>
  `)
}

export function submissionRejectedEmail(vesselName: string, notes: string) {
  return base(`
    <h2 style="color: #1B3A6B; margin-top: 0;">Update on your vessel listing application</h2>
    <p>
      Thank you for applying to list <strong>${vesselName}</strong> on the Greenwater Foundation
      marketplace. After review, we were unable to approve this application at this time.
    </p>
    ${notes ? `<p><strong>Notes from our team:</strong></p><p style="background: #f5f5f5; padding: 16px; border-radius: 8px;">${notes}</p>` : ''}
    <p style="color: #666;">
      If you believe this is an error or would like to discuss further, please reply to this email.
    </p>
  `)
}

export function claimApprovedEmail(vesselName: string, dashboardUrl: string) {
  return base(`
    <h2 style="color: #1B3A6B; margin-top: 0;">Your vessel claim has been approved!</h2>
    <p>
      Your claim for <strong>${vesselName}</strong> has been verified and approved by the
      Greenwater Foundation team.
    </p>
    <p>
      You now have operator access to manage your vessel listing, update information, and
      view inquiries from marine scientists.
    </p>
    <p>
      <a href="${dashboardUrl}" style="background: #2A7B6F; color: white; padding: 12px 24px; border-radius: 24px; text-decoration: none; font-weight: 600; display: inline-block; margin-top: 8px;">
        Go to Your Operator Dashboard
      </a>
    </p>
  `)
}

export function claimRejectedEmail(vesselName: string, notes: string) {
  return base(`
    <h2 style="color: #1B3A6B; margin-top: 0;">Update on your vessel claim</h2>
    <p>
      Thank you for submitting a claim for <strong>${vesselName}</strong>. After review, we were
      unable to verify your relationship to this vessel at this time.
    </p>
    ${notes ? `<p><strong>Notes from our team:</strong></p><p style="background: #f5f5f5; padding: 16px; border-radius: 8px;">${notes}</p>` : ''}
    <p style="color: #666;">
      If you believe this is an error or have additional documentation to support your claim,
      please reply to this email.
    </p>
  `)
}

export function scientistApprovedEmail(firstName: string, notes?: string) {
  return base(`
    <h2 style="color: #1B3A6B; margin-top: 0;">Your Greenwater account has been verified!</h2>
    <p>Hi ${firstName},</p>
    <p>
      Your account has been reviewed and approved by the Greenwater Foundation team.
      You can now contact vessel operators directly through the platform.
    </p>
    ${notes ? `<p><strong>Note from our team:</strong></p><p style="background: #f5f5f5; padding: 16px; border-radius: 8px;">${notes}</p>` : ''}
    <p>
      <a href="${process.env.NEXT_PUBLIC_SITE_URL}" style="background: #2A7B6F; color: white; padding: 12px 24px; border-radius: 24px; text-decoration: none; font-weight: 600; display: inline-block; margin-top: 8px;">
        Browse Research Vessels
      </a>
    </p>
  `)
}

export function migrationWelcomeEmail(firstName: string, setupLink: string) {
  return base(`
    <h2 style="color: #1B3A6B; margin-top: 0;">Welcome to Greenwater Foundation</h2>
    <p>Hi ${firstName},</p>
    <p>
      Your account has been created on the Greenwater Foundation vessel marketplace.
      Click the button below to set your password and get started.
    </p>
    <p>
      <a href="${setupLink}" style="background: #2A7B6F; color: white; padding: 12px 24px; border-radius: 24px; text-decoration: none; font-weight: 600; display: inline-block; margin-top: 8px;">
        Set Up Your Account
      </a>
    </p>
    <p style="color: #666; font-size: 14px; margin-top: 24px;">
      This link expires in 24 hours. If you weren't expecting this email, you can safely ignore it.
    </p>
  `)
}

export function scientistRejectedEmail(firstName: string, notes?: string) {
  return base(`
    <h2 style="color: #1B3A6B; margin-top: 0;">Update on your Greenwater verification</h2>
    <p>Hi ${firstName},</p>
    <p>
      Thank you for signing up for Greenwater. After review, we were unable to approve your
      account at this time.
    </p>
    ${notes ? `<p><strong>Notes from our team:</strong></p><p style="background: #f5f5f5; padding: 16px; border-radius: 8px;">${notes}</p>` : ''}
    <p style="color: #666;">
      If you believe this is an error or would like to provide additional information,
      please reply to this email.
    </p>
  `)
}

export function newInquiryOperatorEmail(
  firstName: string,
  lastName: string,
  institution: string,
  title: string,
  vesselName: string,
  body: string,
  dashboardUrl: string,
) {
  return base(`
    <h2 style="color: #1B3A6B; margin-top: 0;">New inquiry for ${vesselName}</h2>
    <p>
      <strong>${firstName} ${lastName}</strong> (${title}, ${institution}) has sent a message
      about <strong>${vesselName}</strong>.
    </p>
    <div style="background: #f5f5f5; padding: 16px; border-radius: 8px; margin: 16px 0;">
      <p style="margin: 0; white-space: pre-wrap;">${body}</p>
    </div>
    <p>
      <a href="${dashboardUrl}" style="background: #2A7B6F; color: white; padding: 12px 24px; border-radius: 24px; text-decoration: none; font-weight: 600; display: inline-block; margin-top: 8px;">
        View &amp; Reply in Dashboard
      </a>
    </p>
  `)
}

export function operatorReplyEmail(
  vesselName: string,
  operatorName: string,
  replyBody: string,
  inboxUrl: string,
) {
  return base(`
    <h2 style="color: #1B3A6B; margin-top: 0;">${operatorName} replied about ${vesselName}</h2>
    <p>You have a new reply regarding your inquiry about <strong>${vesselName}</strong>.</p>
    <div style="background: #f5f5f5; padding: 16px; border-radius: 8px; margin: 16px 0;">
      <p style="margin: 0; white-space: pre-wrap;">${replyBody}</p>
    </div>
    <p>
      <a href="${inboxUrl}" style="background: #2A7B6F; color: white; padding: 12px 24px; border-radius: 24px; text-decoration: none; font-weight: 600; display: inline-block; margin-top: 8px;">
        View Conversation in Inbox
      </a>
    </p>
  `)
}
