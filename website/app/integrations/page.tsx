import Link from 'next/link'
import { ArrowDown, ArrowRight, Cable, Database, MessageSquare } from 'lucide-react'
import { Breadcrumbs } from '@/components/content'
import { JsonLd } from '@/components/json-ld'
import { LogoTile, integrationBrand } from '@/components/brand-logo'
import { buildMetadata } from '@/lib/metadata'
import { directoryExtras, integrations, type IntegrationKind } from '@/lib/integrations'
import { siteUrl } from '@/lib/site-content'
import { graph } from '@/lib/structured-data'

export const metadata = buildMetadata(
  'CRM integrations — messaging, forms & webhooks',
  'Connect WhatsApp Cloud API, email, Telegram and iMessage to Outbound OS. Bring leads in through forms and webhooks, and send events to your own tools.',
  '/integrations',
)

const groups: {
  kind: IntegrationKind
  id: string
  heading: string
  body: string
  Icon: typeof Cable
}[] = [
  {
    kind: 'Channel',
    id: 'channels',
    heading: 'Customer conversations',
    body: 'Connect a sending identity and its reply route. Each provider has its own account and delivery requirements.',
    Icon: MessageSquare,
  },
  {
    kind: 'Lead source',
    id: 'lead-sources',
    heading: 'Leads coming in',
    body: 'Capture live enquiries or import an existing list. Those are different actions: an import does not start outreach.',
    Icon: Cable,
  },
  {
    kind: 'Data out',
    id: 'data-and-agents',
    heading: 'Your data, working elsewhere',
    body: 'Export CRM events to a sheet or receiver, or let an authorised AI client call explicit CRM tools.',
    Icon: Database,
  },
]

const all = [
  ...integrations.map((item) => ({
    slug: item.slug,
    name: item.name,
    kind: item.kind,
    summary: item.summary,
    method: item.connection.method,
    href: `/integrations/${item.slug}`,
  })),
  ...directoryExtras,
]

export default function IntegrationsPage() {
  return (
    <>
      <section className="section section--lead hero-ground">
        <div className="page">
          <Breadcrumbs trail={[{ name: 'Integrations', path: '/integrations' }]} />
          <div className="integrations-intro">
            <div className="integrations-hero">
              <p className="eyebrow">Connected around the customer</p>
              <h1>
                Your channels.
                <br />
                One working system.
              </h1>
              <p className="lede">
                Bring an enquiry in, keep the conversation together, and pass the next action to the
                tools you use. Your accounts stay yours.
              </p>
            </div>
            <div className="integration-overview" aria-label="How the integrations fit together">
              <div>
                <span>01</span>
                <strong>Capture</strong>
                <p>Forms, lead sources and existing lists</p>
              </div>
              <ArrowDown size={17} aria-hidden="true" />
              <div className="integration-overview__focus">
                <LogoTile brand="outboundos" size={34} />
                <strong>Outbound OS</strong>
                <p>The lead, conversation and next action</p>
              </div>
              <ArrowDown size={17} aria-hidden="true" />
              <div>
                <span>02</span>
                <strong>Connect</strong>
                <p>Messaging accounts, event exports and AI clients</p>
              </div>
            </div>
          </div>
          <nav className="integration-jump" aria-label="Integration categories">
            {groups.map((group) => (
              <a key={group.kind} href={`#${group.id}`}>
                <group.Icon size={16} aria-hidden="true" />
                {group.heading}
                <span>{all.filter((item) => item.kind === group.kind).length}</span>
              </a>
            ))}
          </nav>
        </div>
      </section>

      <section className="section section--ruled integration-directory">
        <div className="page">
          {groups.map((group) => (
            <section
              className="dir-group"
              id={group.id}
              key={group.kind}
              aria-labelledby={`${group.id}-heading`}
            >
              <div className="integration-group-heading">
                <group.Icon size={21} aria-hidden="true" />
                <div>
                  <h2 id={`${group.id}-heading`}>{group.heading}</h2>
                  <p>{group.body}</p>
                </div>
              </div>
              <div className="grid grid--3">
                {all
                  .filter((item) => item.kind === group.kind)
                  .map((item) => (
                    <Link
                      key={item.slug}
                      href={item.href}
                      className="dir-card integration-directory__card"
                    >
                      <div className="dir-card__top">
                        <LogoTile brand={integrationBrand[item.slug] ?? 'webhooks'} size={40} />
                        <h3>{item.name}</h3>
                      </div>
                      <p>{item.summary}</p>
                      <div className="integration-directory__meta">
                        <span>{item.method}</span>
                        <ArrowRight size={16} aria-hidden="true" />
                      </div>
                    </Link>
                  ))}
              </div>
            </section>
          ))}
          <p className="integration-directory__note">
            Integration code is included in the open-source release. Hosting, provider accounts and
            provider charges are separate.
          </p>
        </div>
      </section>

      <section className="section section--ruled">
        <div className="page integration-next">
          <div>
            <p className="eyebrow">Choose your first connection</p>
            <h2>Start with the channel your customers use.</h2>
            <p>
              Run Outbound OS, connect your account, then test both directions with a contact you
              own.
            </p>
          </div>
          <div>
            <Link href="/docs/install" className="btn btn--primary btn--lg">
              Read the install guide <ArrowRight size={16} aria-hidden="true" />
            </Link>
            <Link href="/managed-hosting" className="cta-link">
              Get help with setup <ArrowRight size={15} aria-hidden="true" />
            </Link>
          </div>
        </div>
      </section>
      <JsonLd
        data={graph({
          '@type': 'ItemList',
          name: 'Outbound OS integrations',
          itemListElement: all.map((item, index) => ({
            '@type': 'ListItem',
            position: index + 1,
            name: item.name,
            url: `${siteUrl}${item.href}`,
          })),
        })}
      />
    </>
  )
}
