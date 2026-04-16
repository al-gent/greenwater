export default function PrivacyPolicyPage() {
  return (
    <div className="pt-[88px] bg-white min-h-screen">
      <div className="max-w-3xl mx-auto px-4 sm:px-6 lg:px-8 py-16">
        <h1 className="text-3xl font-bold text-navy mb-2">Privacy Policy</h1>
        <p className="text-sm text-gray-400 mb-10">Last updated: March 2026</p>

        <div className="prose prose-gray max-w-none space-y-8 text-gray-700 leading-relaxed">

          <section>
            <h2 className="text-lg font-semibold text-navy mb-2">Overview</h2>
            <p>
              Greenwater Foundation ("we", "us", or "our") operates this platform to connect marine scientists
              with research vessels. This policy explains what information we collect, how we use it, and your
              rights regarding your data. We keep things simple — we collect only what we need and never sell
              your information.
            </p>
          </section>

          <section>
            <h2 className="text-lg font-semibold text-navy mb-2">Information We Collect</h2>
            <ul className="list-disc pl-5 space-y-2">
              <li>
                <strong>Account information</strong> — when you create an account, we store your email address
                and the role you hold on the platform (scientist, operator, or admin).
              </li>
              <li>
                <strong>Vessel inquiries</strong> — when you send a connection request to a vessel operator,
                we store your message so it can be delivered and reviewed.
              </li>
              <li>
                <strong>Vessel submissions and claims</strong> — if you submit or claim a vessel listing, we
                store the details you provide along with your user ID.
              </li>
              <li>
                <strong>Usage data</strong> — we use Vercel Analytics to collect anonymised, aggregate
                information about how the site is used (pages visited, general location by country). No
                personal identifiers are collected through analytics.
              </li>
            </ul>
          </section>

          <section>
            <h2 className="text-lg font-semibold text-navy mb-2">How We Use Your Information</h2>
            <ul className="list-disc pl-5 space-y-2">
              <li>To operate your account and authenticate you securely.</li>
              <li>To facilitate introductions between scientists and vessel operators.</li>
              <li>To review and process vessel listing submissions and operator claims.</li>
              <li>To send transactional emails (e.g. submission confirmations, approval notices) via Brevo.
                  We do not send marketing emails without your consent.</li>
              <li>To understand how the platform is used so we can improve it.</li>
            </ul>
          </section>

          <section>
            <h2 className="text-lg font-semibold text-navy mb-2">Data Storage & Security</h2>
            <p>
              Your data is stored in Supabase, a secure cloud database hosted in the EU. Authentication is
              handled by Supabase Auth using industry-standard encryption. We use row-level security policies
              to ensure users can only access data they are permitted to see. We take reasonable technical
              precautions to protect your information, but no system is completely secure.
            </p>
          </section>

          <section>
            <h2 className="text-lg font-semibold text-navy mb-2">Third-Party Services</h2>
            <p>We use the following third-party services to operate the platform:</p>
            <ul className="list-disc pl-5 space-y-2 mt-2">
              <li><strong>Supabase</strong> — database, file storage, and authentication.</li>
              <li><strong>Vercel</strong> — hosting and anonymised analytics.</li>
              <li><strong>Brevo</strong> — transactional email delivery.</li>
            </ul>
            <p className="mt-2">
              Each of these providers has their own privacy policy. We do not share your data with any other
              third parties.
            </p>
          </section>

          <section>
            <h2 className="text-lg font-semibold text-navy mb-2">Your Rights</h2>
            <p>You have the right to:</p>
            <ul className="list-disc pl-5 space-y-2 mt-2">
              <li>Access the personal data we hold about you.</li>
              <li>Request correction of inaccurate data.</li>
              <li>Request deletion of your account and associated data.</li>
              <li>Withdraw consent at any time where processing is based on consent.</li>
            </ul>
            <p className="mt-2">
              To exercise any of these rights, please email us at{' '}
              <a href="mailto:info@greenwaterfoundation.org" className="text-teal hover:underline">
                info@greenwaterfoundation.org
              </a>.
            </p>
          </section>

          <section>
            <h2 className="text-lg font-semibold text-navy mb-2">Cookies</h2>
            <p>
              We use a single session cookie to keep you logged in. We do not use advertising cookies or
              third-party tracking cookies.
            </p>
          </section>

          <section>
            <h2 className="text-lg font-semibold text-navy mb-2">Changes to This Policy</h2>
            <p>
              We may update this policy from time to time. When we do, we will revise the "last updated"
              date at the top of this page. Continued use of the platform after changes constitutes
              acceptance of the updated policy.
            </p>
          </section>

          <section>
            <h2 className="text-lg font-semibold text-navy mb-2">Contact</h2>
            <p>
              If you have any questions about this policy, please contact us at{' '}
              <a href="mailto:info@greenwaterfoundation.org" className="text-teal hover:underline">
                info@greenwaterfoundation.org
              </a>{' '}
              or visit{' '}
              <a href="https://greenwaterfoundation.org" target="_blank" rel="noopener noreferrer" className="text-teal hover:underline">
                greenwaterfoundation.org
              </a>.
            </p>
          </section>

        </div>
      </div>
    </div>
  )
}
