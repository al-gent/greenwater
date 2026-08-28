interface EmailOptions {
  to: string
  subject: string
  html: string
  /** Brevo tags — echoed back in webhook events (used to tie delivery/bounce
   *  events to a message thread, e.g. `inquiry-<threadId>`). */
  tags?: string[]
}

/** True only on the real production deployment. Vercel preview deployments
 *  (the staging site) build with NODE_ENV=production, hence the VERCEL_ENV
 *  check. Everything email-related keys off this. */
export function isRealProd(): boolean {
  return process.env.NODE_ENV === 'production' && process.env.VERCEL_ENV !== 'preview'
}

export async function sendEmail({ to, subject, html, tags }: EmailOptions) {
  const apiKey = process.env.BREVO_API_KEY
  const fromEmail = process.env.BREVO_FROM_EMAIL ?? 'noreply@greenwaterfoundation.org'
  if (!apiKey) {
    console.warn('BREVO_API_KEY not set — skipping email to', to)
    return
  }
  // Outside production NO email ever reaches a real recipient: everything is
  // redirected to ADMIN_NOTIFY_DEV_EMAIL (or dropped if it's unset). This is
  // the single chokepoint — user-facing mail included, not just notifyAdmins.
  if (!isRealProd()) {
    const devInbox = process.env.ADMIN_NOTIFY_DEV_EMAIL
    if (!devInbox) {
      console.log(`sendEmail [${process.env.NODE_ENV}] suppressed "${subject}" to ${to} — set ADMIN_NOTIFY_DEV_EMAIL to receive it`)
      return
    }
    if (to !== devInbox) {
      console.log(`sendEmail [${process.env.NODE_ENV}] redirecting "${subject}": ${to} → ${devInbox}`)
      subject = `[dev → ${to}] ${subject}`
      to = devInbox
    }
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
      ...(tags?.length ? { tags } : {}),
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

// ── Internal admin notifications ─────────────────────────────────────────────
// These go to the team, not to users: no banner, no marketing footer. Layout
// is a colored type-eyebrow, label/value rows, optional quoted message, and a
// button — notifyAdmins() appends the monthly stats line directly below it.

const isUrl = (v: string) => /^https?:\/\//i.test(v)

const adminBase = (eyebrow: string, color: string, body: string) => `
<div style="font-family: Inter, Arial, sans-serif; max-width: 600px; margin: 0 auto; padding: 24px 8px; color: #1a1a1a;">
  <p style="color: ${color}; font-size: 13px; font-weight: 700; letter-spacing: 0.08em; text-transform: uppercase; margin: 0 0 18px;">${eyebrow}</p>
  ${body}
</div>
`

/** Label/value rows; rows with empty values are dropped, URL values become links. */
const adminRows = (pairs: Array<[string, string]>) => `
  <table style="border-collapse: collapse; margin: 0 0 4px;">
    ${pairs
      .filter(([, value]) => value)
      .map(
        ([label, value]) => `
    <tr>
      <td style="padding: 4px 18px 4px 0; color: #667085; font-size: 14px; white-space: nowrap; vertical-align: top;">${label}</td>
      <td style="padding: 4px 0; font-size: 16px;">${
        isUrl(value) ? `<a href="${value}" style="color: #2A7B6F;">${value}</a>` : value
      }</td>
    </tr>`,
      )
      .join('')}
  </table>
`

const adminQuote = (text: string) => `
  <div style="border-left: 3px solid #e5e7eb; padding: 2px 0 2px 14px; margin: 14px 0; color: #374151;">
    <p style="margin: 0; white-space: pre-wrap; font-size: 16px;">${text}</p>
  </div>
`

const adminButton = (href: string, label: string) => `
  <p style="margin: 18px 0 0;">
    <a href="${href}" style="background: #2A7B6F; color: white; padding: 11px 22px; border-radius: 8px; text-decoration: none; font-weight: 600; font-size: 15px; display: inline-block;">
      ${label}
    </a>
  </p>
`

export function newClaimAdminEmail(
  vesselName: string,
  claimantName: string,
  claimantEmail: string,
  role: string,
  organization: string,
  message: string,
  adminUrl: string,
) {
  return adminBase('Vessel claim', '#D97706', `
    ${adminRows([
      ['Vessel', vesselName],
      ['Claimant', claimantName],
      ['Role', role],
      ['Organization', organization],
      ['Email', claimantEmail],
    ])}
    ${adminQuote(message)}
    ${adminButton(adminUrl, 'Review claim')}
  `)
}

export function newUserAdminEmail(
  name: string,
  email: string,
  accountType: string,
  institution: string,
  title: string,
  adminUrl: string,
) {
  return adminBase('New signup', '#2A7B6F', `
    ${adminRows([
      ['Name', name],
      ['Signed up as', accountType === 'vessel' ? 'vessel operator' : 'researcher'],
      ['Title', title],
      ['Institution', institution],
      ['Email', email],
    ])}
    ${accountType !== 'vessel' ? '<p style="font-size: 14px; color: #667085; margin: 10px 0 0;">Researchers need verification before they can message operators.</p>' : ''}
    ${adminButton(adminUrl, 'Review signup')}
  `)
}

export function newSubmissionAdminEmail(
  vesselName: string,
  operatorName: string,
  submitterEmail: string,
  adminUrl: string,
) {
  return adminBase('Listing request', '#1B3A6B', `
    ${adminRows([
      ['Vessel', vesselName],
      ['Submitted by', operatorName],
      ['Email', submitterEmail],
    ])}
    ${adminButton(adminUrl, 'Review listing request')}
  `)
}

export function unclaimedVesselInquiryEmail(
  vesselName: string,
  contactName: string,
  scientistName: string,
  affiliation: string,
  body: string,
  dates: string,
  vesselUrl: string,
) {
  return base(`
    <h2 style="color: #1B3A6B; margin-top: 0;">A researcher is interested in chartering ${vesselName}</h2>
    <p>${contactName ? `Hi ${contactName},` : 'Hello,'}</p>
    <p>
      <strong>${scientistName}</strong>${affiliation ? ` (${affiliation})` : ''} sent an inquiry about
      <strong>${vesselName}</strong> through VesselConnect, the Greenwater Foundation's marketplace
      connecting marine scientists with research vessels.${dates ? ` Requested dates: <strong>${dates}</strong>.` : ''}
    </p>
    <div style="background: #f5f5f5; padding: 16px; border-radius: 8px; margin: 16px 0;">
      <p style="margin: 0; white-space: pre-wrap;">${body}</p>
    </div>
    <p>
      Your vessel is listed on VesselConnect, but no one has claimed its operator account yet.
      Create a free account to respond to this inquiry, receive future ones, and keep your
      vessel's information up to date.
    </p>
    <p>
      <a href="${vesselUrl}" style="background: #2A7B6F; color: white; padding: 12px 24px; border-radius: 24px; text-decoration: none; font-weight: 600; display: inline-block; margin-top: 8px;">
        View Your Listing &amp; Claim Your Vessel
      </a>
    </p>
    <p style="color: #666; font-size: 14px; margin-top: 24px;">
      Not the right contact for ${vesselName}? We'd be grateful if you could forward this to
      whoever handles charters — or reply to this email and we'll update our records.
    </p>
  `)
}

export function newMessageAdminEmail(
  vesselName: string,
  fromName: string,
  fromRole: string,
  body: string,
  adminUrl: string,
) {
  return adminBase('Message', '#64748b', `
    ${adminRows([
      ['Vessel', vesselName],
      ['From', `${fromName} (${fromRole})`],
    ])}
    ${adminQuote(body)}
    ${adminButton(adminUrl, 'Open conversation')}
  `)
}

export function unroutedInquiryAdminEmail(
  vesselName: string,
  scientistName: string,
  affiliation: string,
  body: string,
  adminUrl: string,
  /** [label, value] pairs of whatever the vessel record knows about its
   *  operator — leads for the web search to find a real contact. */
  vesselDetails: Array<[string, string]> = [],
) {
  return adminBase('Needs hand-routing', '#dc2626', `
    <p style="font-size: 16px; margin: 0 0 14px;">
      This vessel is unclaimed and has no contact email on file — <strong>nobody was
      notified</strong>. It needs a human to connect the dots.
    </p>
    ${adminRows([
      ['Vessel', vesselName],
      ['From', `${scientistName}${affiliation ? ` (${affiliation})` : ''}`],
    ])}
    ${adminQuote(body)}
    ${vesselDetails.length ? `
    <p style="font-size: 14px; color: #667085; margin: 14px 0 6px;">Everything we know about this vessel's operator:</p>
    ${adminRows(vesselDetails)}` : ''}
    ${adminButton(adminUrl, 'Open admin dashboard')}
  `)
}

export function scientistReplyOperatorEmail(
  vesselName: string,
  scientistName: string,
  replyBody: string,
  dashboardUrl: string,
) {
  return base(`
    <h2 style="color: #1B3A6B; margin-top: 0;">${scientistName} replied about ${vesselName}</h2>
    <p>There's a new message in an inquiry thread for <strong>${vesselName}</strong>.</p>
    <div style="background: #f5f5f5; padding: 16px; border-radius: 8px; margin: 16px 0;">
      <p style="margin: 0; white-space: pre-wrap;">${replyBody}</p>
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
