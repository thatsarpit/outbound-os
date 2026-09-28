import Link from 'next/link'
import { buildMetadata } from '@/lib/metadata'
import { contentUpdated, site } from '@/lib/site-content'

export const metadata = buildMetadata(
  'Privacy',
  'What personal data this website and the Outbound OS project handle: no cookies or trackers on the site, no telemetry in the software, and what happens to form messages.',
  '/privacy',
)

/**
 * Privacy, in plain words. Every statement here is checkable: the site is a
 * static export with no cookies or analytics, the software has no telemetry,
 * and the one form posts to the maintainers' own Outbound OS instance.
 */
export default function PrivacyPage() {
  const updated = new Date(`${contentUpdated}T00:00:00Z`).toLocaleDateString('en-GB', {
    day: 'numeric',
    month: 'long',
    year: 'numeric',
    timeZone: 'UTC',
  })

  return (
    <section className="section section--lead">
      <div className="page page--prose legal">
        <p className="eyebrow">Legal</p>
        <h1>Privacy</h1>
        <p className="doc-meta">Last updated {updated}</p>

        <div className="legal__body flow-lg">
          <section>
            <h2>This website</h2>
            <p>
              outboundos.space is a static website. It sets no cookies of its
              own and uses no analytics, advertising or tracking scripts. Fonts
              and images are served from this domain.
            </p>
            <p>
              The site is served by Cloudflare, which processes technical
              request data such as IP addresses to deliver pages and protect
              against abuse, under its own privacy policy.
            </p>
          </section>

          <section>
            <h2>The contact form</h2>
            <p>
              If you use the form on the{' '}
              <Link className="link" href="/managed-hosting">
                managed hosting
              </Link>{' '}
              page, what you enter — your name, work email, company and the
              details you choose to add — is sent to the maintainers&rsquo; own
              Outbound OS instance and stored as an enquiry so we can reply.
              We use it only to answer you and to discuss the service you asked
              about. We do not sell it or add you to a mailing list.
            </p>
            <p>
              To have it corrected or deleted, email{' '}
              <a className="link" href={`mailto:${site.email}`}>
                {site.email}
              </a>
              .
            </p>
          </section>

          <section>
            <h2>The software you host</h2>
            <p>
              When you run Outbound OS yourself, the data in it — your users,
              leads and conversations — stays on your server. The software
              sends no telemetry to the maintainers. It contacts only the
              services you connect, such as Meta, your mailboxes and the
              integrations you switch on. You are responsible for that data and
              for the consent and record-keeping rules where you operate.
            </p>
          </section>

          <section>
            <h2>Managed hosting</h2>
            <p>
              If the maintainers host an instance for you, we process the data
              in it on your behalf and only to run the service. The terms,
              including a data processing agreement where you need one, are
              agreed with you before the instance holds any data.
            </p>
          </section>

          <section>
            <h2>GitHub</h2>
            <p>
              The code, issues and discussions are hosted on GitHub. What you
              post there is public and handled under GitHub&rsquo;s privacy
              terms.
            </p>
          </section>

          <section>
            <h2>Contact</h2>
            <p>
              Privacy questions:{' '}
              <a className="link" href={`mailto:${site.email}`}>
                {site.email}
              </a>
              .
            </p>
          </section>
        </div>
      </div>
    </section>
  )
}
