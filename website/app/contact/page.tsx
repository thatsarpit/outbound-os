import Link from 'next/link'
import { ArrowRight, Bug, MessagesSquare, Server, ShieldAlert } from 'lucide-react'
import { Breadcrumbs } from '@/components/content'
import { buildMetadata } from '@/lib/metadata'
import { site } from '@/lib/site-content'

export const metadata = buildMetadata(
  'Contact — help, bugs, security, managed hosting',
  'Where to go for Outbound OS help: GitHub Discussions for questions, issues for bugs, private reporting for security, and email for managed hosting.',
  '/contact',
)

/**
 * Contact is a directory, not another conversion page. For an open-source
 * project most routes are public on GitHub, so answers help the next person
 * too; only managed hosting, security and private matters leave it.
 */
export default function ContactPage() {
  const generalEmail = `mailto:${site.email}?subject=General%20enquiry`

  const routes = [
    {
      icon: MessagesSquare,
      label: 'Questions and help',
      heading: 'Ask in GitHub Discussions.',
      body: 'Setup questions, how-tos and ideas. Answers there help everyone who searches for the same thing later.',
      href: site.discussionsUrl,
      action: 'Open Discussions',
      primary: true,
    },
    {
      icon: Bug,
      label: 'Bugs',
      heading: 'Open an issue.',
      body: 'Include your version, what you did, what happened and what you expected. Never paste credentials or real customer data.',
      href: `${site.githubUrl}/issues/new/choose`,
      action: 'Report a bug',
    },
    {
      icon: ShieldAlert,
      label: 'Security',
      heading: 'Report a vulnerability privately.',
      body: 'Through GitHub’s private vulnerability reporting, never a public issue. Acknowledged within three working days.',
      href: `${site.githubUrl}/security/advisories/new`,
      action: 'Report privately',
    },
    {
      icon: Server,
      label: 'Managed hosting and setup',
      heading: 'Have us run it, or help you set it up.',
      body: 'For hosting, installation help or a walkthrough with your own enquiries.',
      href: '/managed-hosting',
      action: 'Get in touch',
      internal: true,
    },
  ]

  return (
    <>
      <section className="section section--lead">
        <div className="page">
          <div className="contact-hero">
            <Breadcrumbs trail={[{ name: 'Contact', path: '/contact' }]} />
            <p className="eyebrow">Contact</p>
            <h1>Start with the reason you are writing.</h1>
            <p className="lede">
              Most help happens in the open on GitHub. Choose the route that
              matches what you need.
            </p>
          </div>
        </div>
      </section>

      <section className="section section--ruled">
        <div className="page split contact-body">
          <div className="section-head split__sticky">
            <p className="eyebrow">Directory</p>
            <h2>Send it to the right place.</h2>
            <p>
              Anything else — press, partnerships, private matters — goes to{' '}
              <a className="link" href={generalEmail}>
                {site.email}
              </a>
              .
            </p>
          </div>

          <div className="contact-directory stack">
            {routes.map((route) => {
              const Icon = route.icon
              const className = route.primary ? 'btn btn--primary' : 'btn btn--secondary'
              return (
                <article className="contact-route" key={route.label}>
                  <div>
                    <span className="contact-route__label">
                      <span className="contact-route__icon">
                        <Icon size={14} strokeWidth={1.9} aria-hidden="true" />
                      </span>
                      {route.label}
                    </span>
                    <h3>{route.heading}</h3>
                    <p>{route.body}</p>
                  </div>
                  {route.internal ? (
                    <Link href={route.href} className={className}>
                      {route.action}
                      <ArrowRight size={15} />
                    </Link>
                  ) : (
                    <a href={route.href} className={className}>
                      {route.action}
                      <ArrowRight size={15} />
                    </a>
                  )}
                </article>
              )
            })}
          </div>
        </div>
      </section>
    </>
  )
}
