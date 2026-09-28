import { buildMetadata } from '@/lib/metadata'
import { site } from '@/lib/site-content'
import { DemoForm } from '@/components/demo-form'
import { Breadcrumbs } from '@/components/content'

export const metadata = buildMetadata(
  'Managed hosting and setup help',
  'Have the Outbound OS maintainers host and run your instance, help set up your own install, or walk you through the product with your own enquiries.',
  '/managed-hosting',
)

/**
 * The single conversion page.
 *
 * The site previously had three CTAs with different wording — "Request
 * Access", "Request Access for Walkthrough", "Check workflow fit" — all
 * pointing at one undifferentiated form. Every route now ends here, and the
 * form captures enough to make the call worth both parties' time.
 *
 * The layout is a split: the left column sets expectations so nobody arrives
 * at a call expecting something else, the right column takes the details.
 * The expectations column is the one people actually read before deciding to
 * fill anything in, so it comes first in source order too.
 */
export default function ManagedHostingPage() {
  return (
    <section className="section section--lead hero-ground">
      <div className="page">
        <div className="section-head">
          <Breadcrumbs trail={[{ name: 'Managed hosting', path: '/managed-hosting' }]} />
          <p className="eyebrow">Managed hosting and help</p>
          <h1>Rather not run a server? We can run it for you.</h1>
          <p className="lede">
            Outbound OS is free to self-host. If you would rather not, the
            people who build it can host and run your instance, help you set
            up your own, or walk you through it with your real enquiries.
          </p>
        </div>

        <div className="split split--reverse demo__body">
          <div className="panel" id="request">
            <DemoForm toEmail={site.email} />
          </div>

          <aside className="demo__aside flow-lg">
            <div>
              <h2>Managed hosting</h2>
              <ul className="ticks">
                <li>We run the server, HTTPS, backups and upgrades.</li>
                <li>We help connect your WhatsApp number, mailboxes and lead sources.</li>
                <li>
                  It is the same open-source software. Your data can be
                  exported, and you can move to your own server at any time.
                </li>
              </ul>
            </div>

            <div>
              <h2>Setup help or a walkthrough</h2>
              <ul className="ticks">
                <li>A screen-shared session, no slide deck.</li>
                <li>
                  We work through a sample of your real enquiries and show the
                  queue, the follow-ups and what needs connecting.
                </li>
              </ul>
            </div>

            <div className="demo__note">
              <h3>Found a bug or have a question?</h3>
              <p>
                Ask in{' '}
                <a className="link" href={site.discussionsUrl}>
                  GitHub Discussions
                </a>{' '}
                or open an issue — answers there help everyone who searches
                later.
              </p>
            </div>
          </aside>
        </div>
      </div>
    </section>
  )
}
