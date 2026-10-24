import Link from 'next/link'
import { notFound } from 'next/navigation'
import { ArrowDown, ArrowRight, Check, CircleCheck, KeyRound, ListChecks } from 'lucide-react'
import { Breadcrumbs, Code, Faq, Related } from '@/components/content'
import { JsonLd } from '@/components/json-ld'
import { LogoTile, integrationBrand } from '@/components/brand-logo'
import { buildMetadata } from '@/lib/metadata'
import {
  integrationHref,
  integrationName,
  integrationSummary,
  integrations,
} from '@/lib/integrations'
import { contentUpdated } from '@/lib/site-content'
import { articleLd, graph } from '@/lib/structured-data'

type Params = { slug: string }
export const dynamicParams = false
export function generateStaticParams(): Params[] {
  return integrations.map((item) => ({ slug: item.slug }))
}
export async function generateMetadata({ params }: { params: Promise<Params> }) {
  const { slug } = await params
  const item = integrations.find((entry) => entry.slug === slug)
  return item ? buildMetadata(item.title, item.description, `/integrations/${item.slug}`) : {}
}

const guides: Record<string, { href: string; label: string }> = {
  'whatsapp-cloud-api': { href: '/docs/whatsapp-cloud-api', label: 'WhatsApp setup guide' },
  webhooks: { href: '/docs/website-forms', label: 'Incoming source guide' },
  zapier: { href: '/docs/website-forms', label: 'Lead webhook guide' },
  'facebook-lead-ads': { href: '/docs/website-forms', label: 'Lead webhook guide' },
}

export default async function IntegrationPage({ params }: { params: Promise<Params> }) {
  const { slug } = await params
  const item = integrations.find((entry) => entry.slug === slug)
  if (!item) notFound()
  const path = `/integrations/${item.slug}`
  const guide = guides[item.slug]
  return (
    <>
      <section className="section section--lead hero-ground">
        <div className="page">
          <Breadcrumbs
            trail={[
              { name: 'Integrations', path: '/integrations' },
              { name: item.name, path },
            ]}
          />
          <div className="integration-detail-intro">
            <div className="integration-hero">
              <div className="integration-identity">
                <LogoTile brand={integrationBrand[item.slug] ?? 'webhooks'} size={44} />
                <span>{item.connection.method}</span>
              </div>
              <p className="eyebrow">
                {item.kind} · {item.name}
              </p>
              <h1>{item.h1}</h1>
              <p className="lede">{item.intro[0]}</p>
              <div className="hero__actions">
                <a href="#setup" className="btn btn--primary btn--lg">
                  See the setup <ArrowRight size={16} aria-hidden="true" />
                </a>
                {guide && (
                  <Link href={guide.href} className="cta-link">
                    {guide.label}
                    <ArrowRight size={15} aria-hidden="true" />
                  </Link>
                )}
              </div>
            </div>
            <figure className="integration-map">
              <figcaption>
                <span>Connection path</span>
                <span>{item.kind}</span>
              </figcaption>
              <ol>
                {item.connection.flow.map((step, index) => (
                  <li key={step.title}>
                    <div>
                      <span className="integration-map__number">0{index + 1}</span>
                      <div>
                        <h2>{step.title}</h2>
                        <p>{step.body}</p>
                      </div>
                    </div>
                    {index < item.connection.flow.length - 1 && (
                      <ArrowDown size={17} aria-hidden="true" />
                    )}
                  </li>
                ))}
              </ol>
              <div className="integration-map__footer">
                <KeyRound size={15} aria-hidden="true" />
                Your accounts. Your installation.
              </div>
            </figure>
          </div>
        </div>
      </section>

      <section className="section section--ruled integration-readiness">
        <div className="page">
          <div className="integration-readiness__head">
            <ListChecks size={20} aria-hidden="true" />
            <div>
              <p className="eyebrow">Before you connect</p>
              <h2>What you need ready.</h2>
            </div>
          </div>
          <ul>
            {item.connection.prerequisites.map((entry) => (
              <li key={entry}>
                <Check size={16} aria-hidden="true" />
                <span>{entry}</span>
              </li>
            ))}
          </ul>
        </div>
      </section>

      <section className="section section--ruled" id="setup">
        <div className="page split integration-body">
          <div className="section-head">
            <p className="eyebrow">In your workspace</p>
            <h2>What this connection makes possible.</h2>
            {item.intro.slice(1).map((paragraph) => (
              <p key={paragraph}>{paragraph}</p>
            ))}
            <ul className="integration-capabilities">
              {item.capabilities.map((capability) => (
                <li key={capability}>
                  <Check size={16} aria-hidden="true" />
                  <span>{capability}</span>
                </li>
              ))}
            </ul>
            <aside className="integration-boundary">
              <h3>How this connection works</h3>
              <p>{item.connection.boundary}</p>
            </aside>
          </div>
          <div className="integration-setup">
            <p className="eyebrow">Connect & verify</p>
            <h2 className="integration-steps__heading">Set it up, one step at a time.</h2>
            <ol className="integration-steps">
              {item.steps.map((step, index) => (
                <li key={step.title}>
                  <span className="integration-steps__number">
                    {String(index + 1).padStart(2, '0')}
                  </span>
                  <div>
                    <h3>{step.title}</h3>
                    <p>{step.body}</p>
                  </div>
                </li>
              ))}
            </ol>
            <div className="integration-checkpoint">
              <CircleCheck size={20} aria-hidden="true" />
              <div>
                <h3>Check the whole connection</h3>
                <p>{item.connection.checkpoint}</p>
              </div>
            </div>
            {item.code && (
              <details className="integration-code">
                <summary>
                  Configuration example<span>View code</span>
                </summary>
                <Code label={item.code.label}>{item.code.body}</Code>
              </details>
            )}
          </div>
        </div>
      </section>
      {item.faq.length > 0 && <Faq items={item.faq} heading={`${item.name} questions`} />}
      <Related
        heading="Build the rest of your workflow"
        links={item.related.map((relatedSlug) => ({
          href: integrationHref(relatedSlug),
          title: integrationName(relatedSlug),
          body: integrationSummary(relatedSlug),
        }))}
      />
      <section className="section section--ruled">
        <div className="page integration-next">
          <div>
            <p className="eyebrow">Make it your own</p>
            <h2>Connect {item.name} to your workspace.</h2>
            <p>Start with the installation guide, or get help connecting your own accounts.</p>
          </div>
          <div>
            <Link href="/docs/install" className="btn btn--primary btn--lg">
              Run Outbound OS
              <ArrowRight size={16} aria-hidden="true" />
            </Link>
            <Link href="/managed-hosting" className="cta-link">
              Get setup help <ArrowRight size={15} aria-hidden="true" />
            </Link>
          </div>
        </div>
      </section>
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
