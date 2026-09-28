import Link from 'next/link'
import { Breadcrumbs, InstallBand } from '@/components/content'
import { JsonLd } from '@/components/json-ld'
import { buildMetadata } from '@/lib/metadata'
import { directoryExtras, integrations, type IntegrationKind } from '@/lib/integrations'
import { siteUrl } from '@/lib/site-content'
import { graph } from '@/lib/structured-data'

export const metadata = buildMetadata(
  'Integrations — WhatsApp, email, IndiaMART, Facebook Lead Ads',
  'Every Outbound OS integration: WhatsApp Cloud API, AiSensy, email, Telegram, iMessage, IndiaMART, Facebook Lead Ads, Zapier, Google Sheets and signed webhooks.',
  '/integrations',
)

const groups: { kind: IntegrationKind; heading: string; body: string }[] = [
  {
    kind: 'Channel',
    heading: 'Channels',
    body: 'Where messages go out and replies come back. Each one threads onto the same lead.',
  },
  {
    kind: 'Lead source',
    heading: 'Lead sources',
    body: 'Where leads come from. Every source is a webhook with a field map, so adding one is a setting, not code.',
  },
  {
    kind: 'Data out',
    heading: 'Data out',
    body: 'Where lead and message events go next — sheets, your own systems, or an AI agent.',
  },
]

const all = [
  ...integrations.map((i) => ({ slug: i.slug, name: i.name, kind: i.kind, summary: i.summary, href: `/integrations/${i.slug}` })),
  ...directoryExtras,
]

export default function IntegrationsPage() {
  return (
    <>
      <section className="section section--lead">
        <div className="page integrations-hero">
          <Breadcrumbs trail={[{ name: 'Integrations', path: '/integrations' }]} />
          <p className="eyebrow">Integrations</p>
          <h1>Everything Outbound OS connects to.</h1>
          <p className="lede">
            WhatsApp, email, Telegram and iMessage to reach people; forms, ads
            and marketplaces to bring them in; sheets, webhooks and AI agents
            to use what happens. All of it ships in the open-source release —
            nothing here is a paid add-on.
          </p>
        </div>
      </section>

      <section className="section section--ruled">
        <div className="page">
          {groups.map((group) => (
            <div className="dir-group" key={group.kind}>
              <h2>{group.heading}</h2>
              <p>{group.body}</p>
              <div className="grid grid--3">
                {all
                  .filter((item) => item.kind === group.kind)
                  .map((item) => (
                    <Link key={item.slug} href={item.href} className="dir-card">
                      <h3>{item.name}</h3>
                      <p>{item.summary}</p>
                    </Link>
                  ))}
              </div>
            </div>
          ))}
        </div>
      </section>

      <InstallBand
        heading="Connect your first channel in minutes."
        body="Install with Docker, and the setup wizard walks you through WhatsApp, email and your first lead source."
      />

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
