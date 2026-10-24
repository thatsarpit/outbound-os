import Link from 'next/link'
import { ArrowRight, ArrowUpRight, Bug, MessagesSquare, Server, ShieldAlert } from 'lucide-react'
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
      icon: Server,
      label: 'Setup and hosting',
      heading: 'Get your team working in Outbound OS.',
      body: 'Installation, channel connections, imports or managed hosting. Start with your workflow; we will agree the scope and quote with you.',
      href: '/managed-hosting#request',
      action: 'Request a setup plan',
      internal: true,
      primary: true,
    },
    {
      icon: MessagesSquare,
      label: 'Questions and help',
      heading: 'Ask in GitHub Discussions.',
      body: 'Setup questions, how-tos and ideas. Answers there help everyone who searches for the same thing later.',
      href: site.discussionsUrl,
      action: 'Open Discussions',
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
  ]

  return (
    <>
      <section className="section section--lead hero-ground">
        <div className="page">
          <div className="contact-hero">
            <Breadcrumbs trail={[{ name: 'Contact', path: '/contact' }]} />
            <p className="eyebrow">Contact</p>
            <h1>A good place to start.</h1>
            <p className="lede">
              Get help setting up your sales workspace, ask a product question,
              or share something that needs fixing. Here is the right place for each.
            </p>
          </div>
        </div>
      </section>

      <section className="section section--ruled">
        <div className="page split contact-body">
          <div className="section-head split__sticky">
            <p className="eyebrow">Directory</p>
            <h2>What can we help with?</h2>
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
                <article className={`contact-route${route.primary ? ' contact-route--featured' : ''}`} key={route.label}>
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
                      <ArrowRight size={15} aria-hidden="true" />
                    </Link>
                  ) : (
                    <a href={route.href} className={className}>
                      {route.action}
                      <ArrowUpRight size={15} aria-hidden="true" />
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
