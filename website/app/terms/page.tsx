import Link from 'next/link'
import { buildMetadata } from '@/lib/metadata'
import { contentUpdated, site } from '@/lib/site-content'

export const metadata = buildMetadata(
  'Terms',
  'The terms that apply to Outbound OS: the AGPL-3.0 license for the software, how the website may be used, and how managed hosting is agreed.',
  '/terms',
)

/**
 * Terms. The software's terms are its license; nothing on this page adds to
 * or narrows it. Managed hosting is contracted separately, so this page only
 * says so rather than inventing service levels.
 */
export default function TermsPage() {
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
        <h1>Terms</h1>
        <p className="doc-meta">Last updated {updated}</p>

        <div className="legal__body flow-lg">
          <section>
            <h2>The software</h2>
            <p>
              Outbound OS is licensed under the{' '}
              <a className="link" href={site.licenseUrl}>
                GNU Affero General Public License v3.0
              </a>
              . That license is the complete set of terms for using, copying,
              modifying and distributing the software, including its warranty
              disclaimer: the software is provided as is, without warranty of
              any kind. Nothing on this website changes the license.
            </p>
          </section>

          <section>
            <h2>Sending messages responsibly</h2>
            <p>
              Whoever runs an install is the sender of every message it sends.
              That means messaging only people you have a basis to contact,
              honouring opt-outs, following Meta&rsquo;s WhatsApp Business
              policies and your email providers&rsquo; rules, and complying with
              the marketing, privacy and communications law of every market you
              contact. The software&rsquo;s limits and opt-out handling help;
              they do not make you compliant.
            </p>
          </section>

          <section>
            <h2>Third-party services</h2>
            <p>
              WhatsApp, email providers, IndiaMART and the other services
              Outbound OS connects to have their own terms and can suspend
              access independently of the project.
            </p>
          </section>

          <section>
            <h2>Managed hosting</h2>
            <p>
              Hosting or setup provided by the maintainers is governed by a
              separate written agreement, covering scope, fees, support, data
              handling and termination, made before the service starts. See{' '}
              <Link className="link" href="/managed-hosting">
                managed hosting
              </Link>
              .
            </p>
          </section>

          <section>
            <h2>This website</h2>
            <p>
              The site&rsquo;s text and documentation may be quoted and linked
              freely. &ldquo;Outbound OS&rdquo; and its logo identify this
              project; please do not use them in a way that suggests a fork or
              a service is the official project or endorsed by it.
            </p>
            <p>
              Other product names on this site are trademarks of their owners
              and are used only to describe compatibility or comparison.
            </p>
          </section>

          <section>
            <h2>Contact</h2>
            <p>
              <a className="link" href={`mailto:${site.email}`}>
                {site.email}
              </a>
            </p>
          </section>
        </div>
      </div>
    </section>
  )
}
