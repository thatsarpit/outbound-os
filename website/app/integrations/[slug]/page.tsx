import Link from 'next/link'
import { notFound } from 'next/navigation'
import { ArrowRight } from 'lucide-react'
import { Breadcrumbs, Code, Faq, InstallBand, Related } from '@/components/content'
import { JsonLd } from '@/components/json-ld'
import { LogoPair } from '@/components/logo-pair'
import { integrationBrand } from '@/components/brand-logo'
import { buildMetadata } from '@/lib/metadata'
import { integrationHref, integrationName, integrationSummary, integrations } from '@/lib/integrations'
import { contentUpdated, site } from '@/lib/site-content'
import { articleLd, graph } from '@/lib/structured-data'

type Params = { slug: string }

export const dynamicParams = false

export function generateStaticParams(): Params[] {
  return integrations.map((i) => ({ slug: i.slug }))
}

export async function generateMetadata({ params }: { params: Promise<Params> }) {
  const { slug } = await params
  const item = integrations.find((i) => i.slug === slug)
  if (!item) return {}
  return buildMetadata(item.title, item.description, `/integrations/${item.slug}`)
}

/** Guides that go deeper than an integration page can. */
const guides: Record<string, { href: string; label: string }> = {
  'whatsapp-cloud-api': { href: '/docs/whatsapp-cloud-api', label: 'Full setup guide' },
  indiamart: { href: '/docs/website-forms', label: 'How lead webhooks work' },
  zapier: { href: '/docs/website-forms', label: 'How lead webhooks work' },
  'facebook-lead-ads': { href: '/docs/website-forms', label: 'How lead webhooks work' },
}

export default async function IntegrationPage({ params }: { params: Promise<Params> }) {
  const { slug } = await params
  const item = integrations.find((i) => i.slug === slug)
  if (!item) notFound()

  const path = `/integrations/${item.slug}`
  const guide = guides[item.slug]

  return (
    <>
      <section className="section section--lead hero-ground">
        <div className="page integration-hero">
          <Breadcrumbs
            trail={[
              { name: 'Integrations', path: '/integrations' },
              { name: item.name, path },
            ]}
          />
          <LogoPair brands={['outboundos', integrationBrand[item.slug] ?? 'webhooks']} />
          <p className="eyebrow">
            {item.kind} · {item.name}
          </p>
          <h1>{item.h1}</h1>
          {item.intro.map((paragraph, index) => (
            <p key={index} className={index === 0 ? 'lede' : 'integration-hero__more'}>
              {paragraph}
            </p>
          ))}
          <div className="hero__actions">
            <Link href="/docs/install" className="btn btn--primary btn--lg">
              Install Outbound OS
            </Link>
            {guide ? (
              <Link href={guide.href} className="cta-link">
                {guide.label}
                <ArrowRight size={15} aria-hidden="true" />
              </Link>
            ) : (
              <a href={site.githubUrl} className="cta-link">
                View on GitHub
                <ArrowRight size={15} aria-hidden="true" />
              </a>
            )}
          </div>
        </div>
      </section>

      <section className="section section--ruled">
        <div className="page split integration-body">
          <div className="section-head">
            <p className="eyebrow">What you get</p>
            <h2>What the {item.name} integration does.</h2>
            <ul className="checks integration-checks">
              {item.capabilities.map((capability) => (
                <li key={capability}>{capability}</li>
              ))}
            </ul>
          </div>

          <div>
            <h2 className="integration-steps__heading">Set it up</h2>
            <ol className="steps integration-steps">
              {item.steps.map((step, index) => (
                <li key={step.title}>
                  <span className="steps__n tabular">{String(index + 1).padStart(2, '0')}</span>
                  <div>
                    <h3>{step.title}</h3>
                    <p>{step.body}</p>
                  </div>
                </li>
              ))}
            </ol>
            {item.code && (
              <div className="integration-code">
                <Code label={item.code.label}>{item.code.body}</Code>
              </div>
            )}
          </div>
        </div>
      </section>

      {item.faq.length > 0 && <Faq items={item.faq} heading={`${item.name} questions`} />}

      <Related
        heading="Related integrations"
        links={item.related.map((relatedSlug) => ({
          href: integrationHref(relatedSlug),
          title: integrationName(relatedSlug),
          body: integrationSummary(relatedSlug),
        }))}
      />

      <InstallBand />

      <JsonLd
        data={graph(
          articleLd({
            title: `${item.name} integration`,
            description: item.description,
            path,
            dateModified: contentUpdated,
          }),
        )}
      />
    </>
  )
}
