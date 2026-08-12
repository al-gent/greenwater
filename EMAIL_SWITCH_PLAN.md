# Email Switch Plan: info@ from Microsoft/GoDaddy → Google Workspace

Runbook for moving @greenwaterfoundation.org email to Google Workspace.
Written 2026-08-11. All coordination with Meg and Mark is remote — phone or video call.

## Key facts

- Mail today: MX → `greenwaterfoundation-org.mail.protection.outlook.com` (priority 0),
  a GoDaddy-resold Microsoft 365 tenant. **The GoDaddy account is Mark's.**
- info@ is shared by Meg and Mark. Meg: Mac + iPhone, reads mail in **Apple Mail**.
  Mark: access method TBD (asked by email). Address must be preserved (government filings).
- Google Workspace admin account: `dev@greenwaterfoundation.org`. Domain verified.
  Free nonprofit plan: activation request submitted 8/11, awaiting approval email.
- info@ is NOT used by any automations (all app email goes through Brevo, and Brevo does
  not depend on the domain SPF record — verified: current SPF has no Brevo include).
- Same address on both systems is fine: the Microsoft info@ and Google info@ are separate
  accounts distinguished by account *type* and password. Apple Mail holds both at once —
  when adding, you pick "Google" as the kind, and that (not the address) decides which
  server it talks to.
- **Never sign out of / remove the old account until the copy is verified.** The old
  mailbox must stay in Apple Mail — the copy works by dragging between the two accounts.

## Before scheduling the switch

- [ ] Free-plan approval email received (goes to 94gent@gmail.com)
- [ ] Mark's answers in: how he reads info@, and whether **Word/Excel/OneDrive are
      licensed through the GoDaddy subscription** (if yes: sort replacements BEFORE cancel)
- [ ] Create accounts in admin.google.com: `info@` (+ `mark@`, `lisa@`, others as agreed)
- [ ] Set the Google password for info@; plan how Meg and Mark each receive it
- [ ] Verify login works at mail.google.com with info@'s Google credentials
- [ ] Schedule a morning call with Meg (and Mark, or a separate same-day call)

## Switch day

### 1. DNS changes (Adam, Cloudflare — ~10 min)

- [ ] MX: delete `greenwaterfoundation-org.mail.protection.outlook.com`,
      add `smtp.google.com` priority 1 (Google's modern single-record setup)
- [ ] SPF: change TXT `v=spf1 include:secureserver.net -all`
      → `v=spf1 include:_spf.google.com -all`
- [ ] DKIM: Admin console → Apps → Google Workspace → Gmail → Authenticate email →
      generate key → add the `google._domainkey` TXT in Cloudflare → click Authenticate
- [ ] Leave the `NETORGFT13059086.onmicrosoft.com` TXT alone until cancellation
- [ ] Test: send from an outside address to info@ → must arrive in the **Gmail** inbox
      (mail.google.com). May take up to ~1 hour for routing to settle; usually minutes.

**Rollback:** if anything is wrong, restore MX to
`greenwaterfoundation-org.mail.protection.outlook.com` priority 0 — mail returns to
Outlook. Nothing is lost either way; mail is only ever routed, never deleted.

### 2. Meg's devices (call, ~10 min per device)

On the Mac: Mail → Settings → Accounts → Add Account → **Google** →
info@greenwaterfoundation.org + the new Google password.
On the iPhone: Settings → Mail → Accounts → Add Account → **Google** → same login.

- [ ] Do NOT remove the old account — add the new one alongside
- [ ] Rename account descriptions to "info (old)" and "info (new)" (Mail → Settings →
      Accounts → Description) so the sidebar isn't two identical labels
- [ ] Meg sends a test email from the new account; receives one from outside

### 3. Copy the old mail (on Meg's Mac, same call to start it)

Both mailboxes now sit side by side in Apple Mail.

- [ ] Custom folders: **Option-drag** each folder from the old account onto the new
      account (Option = copy, leaves the original as the safety net)
- [ ] Inbox and Sent (system mailboxes, can't drag the folder itself): open each,
      Select All (Cmd+A), drag the messages onto the matching mailbox under the new account
- [ ] Keep the Mac awake and plugged in; Mail shows a progress spinner (bottom of
      sidebar). Large mailboxes can churn for hours in the background — fine to end the
      call and let it run. If a transfer stalls, re-drag; duplicates are cosmetic only.
- [ ] Calendar (Meg said occasional Outlook scheduling): Mac Calendar app → select the
      Exchange calendar → File → Export → .ics → import at calendar.google.com (info@).
      Contacts if needed: export vCards from the old account, import at contacts.google.com.

### 4. Mark's device(s) (same day, separate call — steps depend on his answers)

- [ ] Add the Google info@ account to whatever client he uses (same "pick Google as the
      account type" logic; if he only uses a web browser, he just uses mail.google.com now)
- [ ] Verify he can see new mail and send

### 5. Verify

- [ ] Meg confirms: old mail visible in the new inbox, folders intact, send/receive works
      on both devices
- [ ] Spot-check Brevo: send a test transactional email from the app (e.g. password
      reset) and confirm delivery

## Buffer period (1–2 weeks)

- [ ] Watch for anything missing or senders reporting bounces
- [ ] Optional extra backup before cancel: Mac Mail → select old mailboxes → Mailbox →
      Export Mailbox → save locally
- [ ] Remove the old (Microsoft) account from Meg's and Mark's devices

## Cancellation (last, and only after everything above)

- [ ] Confirm Mark's Office-apps answer one more time — canceling kills anything
      licensed through the subscription
- [ ] Mark cancels the Microsoft 365 email subscription in his GoDaddy account
- [ ] Clean up DNS: remove the `NETORGFT...onmicrosoft.com` TXT record
- [ ] Confirm the savings: whatever GoDaddy was billing for M365 stops

## After the switch unlocks

- Researcher outreach can send from real @greenwaterfoundation.org addresses
  (replies would have bounced before the MX flip — do not send outreach before this)
- Team on shared Drive/Docs/Calendar under the domain
