import Link from 'next/link'
import { notFound } from 'next/navigation'
import { ArrowRight } from 'lucide-react'
import { Breadcrumbs, Faq, InstallBand, Related } from '@/components/content'
import { buildMetadata } from '@/lib/metadata'
import { alternatives, alternativeBySlug } from '@/lib/alternatives'

type Params = { slug: string }

export const dynamicParams = false

export function generateStaticParams(): Params[] {
  return alternatives.map((a) => ({ slug: a.slug }))
}

export async function generateMetadata({ params }: { params: Promise<Params> }) {
  const { slug } = await params
  const alt = alternativeBySlug(slug)
  if (!alt) return {}
  return buildMetadata(alt.title, alt.description, `/alternatives/${alt.slug}`)
}

export default async function AlternativePage({ params }: { params: Promise<Params> }) {
  const { slug } = await params
  const alt = alternativeBySlug(slug)
  if (!alt) notFound()

  const path = `/alternatives/${alt.slug}`
  const rows: [string, string, string][] = [
    ['What it is', 'Open-source software you run yourself', alt.theyAre],
    ['Where your data lives', 'Your own server and database', 'The vendor’s cloud'],
    ['Paying for it', 'Free software; you pay for your server, and Meta bills template messages to your account', 'Subscription plans plus message charges — see their pricing page'],
    ['Source code', 'Open, AGPL-3.0', 'Closed'],
    ['Lead capture', 'Webhooks with presets for forms, Facebook Lead Ads, IndiaMART, TradeIndia, JustDial, Zapier', 'Through their integrations'],
    ['First contact', 'Automatic, within seconds of a lead arriving', 'Through their automation features'],
    ['Follow-ups', 'Sequences across WhatsApp and email that stop on reply', 'Through their campaigns and automation'],
    ['Other channels', 'Email, Telegram and iMessage on the same lead', alt.theirChannels],
    ['Chatbot builder', 'Not included', 'Included'],
    ['AI agent access', 'MCP server for Claude and other clients', 'Their own AI features'],
    ['Hosting and support', 'You, the community — or managed hosting', 'The vendor'],
    ...(alt.extraRows ?? []),
  ]

  const others = alternatives.filter((a) => a.slug !== alt.slug)

  return (
    <>
      <section className="section section--lead hero-ground">
        <div className="page landing-hero">
          <Breadcrumbs
            trail={[
              { name: 'Alternatives', path: '/alternatives' },
              { name: `${alt.name} alternative`, path },
            ]}
          />
          <p className="eyebrow">Outbound OS vs {alt.name}</p>
          <h1>{alt.h1}</h1>
          <p className="lede">{alt.intro}</p>
          <div className="hero__actions">
            <Link href="/docs/install" className="btn btn--primary btn--lg">
              Install Outbound OS free
            </Link>
            <Link href="/whatsapp-crm" className="cta-link">
              How the WhatsApp CRM works
              <ArrowRight size={15} aria-hidden="true" />
            </Link>
          </div>
        </div>
      </section>

      <section className="section section--ruled">
        <div className="page">
          <div className="section-head">
            <p className="eyebrow">Side by side</p>
            <h2>Outbound OS and {alt.name}, compared.</h2>
          </div>
          <div className="comparison-wrap">
            <table className="comparison comparison--compact versus">
              <thead>
                <tr>
                  <th scope="col"></th>
                  <th scope="col">Outbound OS</th>
                  <th scope="col">{alt.name}</th>
                </tr>
              </thead>
              <tbody>
                {rows.map(([aspect, ours, theirs]) => (
                  <tr key={aspect}>
                    <th scope="row">{aspect}</th>
                    <td>{ours}</td>
                    <td>{theirs}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          <p className="landing-note">
            {alt.name} details are taken from {alt.name}&rsquo;s own website in
            September 2026 and may have changed. {alt.name} is a trademark of its
            owner; Outbound OS is not affiliated with it.
          </p>
        </div>
      </section>

      <section className="section section--ruled section--raised">
        <div className="page landing-cols">
          <div>
            <h2 className="alt-verdict__heading">Choose {alt.name} if</h2>
            <ul className="checks">
              {alt.chooseThem.map((reason) => (
                <li key={reason}>{reason}</li>
              ))}
            </ul>
            <p className="landing-note">
              {alt.name} also advertises: {alt.theirStrengths.join('; ')}.
            </p>
          </div>
          <div>
            <h2 className="alt-verdict__heading">Choose Outbound OS if</h2>
            <ul className="checks">
              {alt.chooseUs.map((reason) => (
                <li key={reason}>{reason}</li>
              ))}
            </ul>
          </div>
        </div>
      </section>

      {alt.together && (
        <section className="section section--ruled">
          <div className="page split">
            <div className="section-head">
              <p className="eyebrow">Use both</p>
              <h2>Keep {alt.name}, add the CRM.</h2>
            </div>
            <div>
              <p className="lede">{alt.together}</p>
              <Link href={`/integrations/${alt.slug}`} className="cta-link alt-together__link">
                {alt.name} integration
                <ArrowRight size={15} aria-hidden="true" />
              </Link>
            </div>
          </div>
        </section>
      )}

      <Faq items={alt.faq} heading={`${alt.name} alternative questions`} />

      <Related
        heading="Other comparisons"
        links={[
          ...others.map((o) => ({
            href: `/alternatives/${o.slug}`,
            title: `Outbound OS vs ${o.name}`,
            body: `How a self-hosted WhatsApp CRM compares with ${o.name}.`,
          })),
          { href: '/self-hosted-crm', title: 'Why self-host a CRM', body: 'What runs where, and the honest trade-offs.' },
        ]}
      />

      <InstallBand />
    </>
  )
}
