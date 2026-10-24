import Link from 'next/link'
import { ArrowRight, Check, Code2, Server, Wrench } from 'lucide-react'
import { Breadcrumbs, Faq } from '@/components/content'
import { buildMetadata } from '@/lib/metadata'
import { site } from '@/lib/site-content'

export const metadata = buildMetadata(
  'Pricing: free software, optional expert help',
  'Self-host the complete Outbound OS CRM for free. Get a quote for installation, Meta WhatsApp setup, managed hosting or ongoing support. Provider fees are separate.',
  '/pricing',
)
const services = [
  {
    icon: Wrench,
    name: 'Setup & launch',
    billing: 'One-time project',
    text: 'A working setup, connected to the way your team sells.',
    items: [
      'Installation, channels and lead sources',
      'Imports, testing and a team walkthrough',
    ],
    href: '/managed-hosting#request',
    cta: 'Get a setup quote',
  },
  {
    icon: Server,
    name: 'Managed & supported',
    billing: 'Recurring service, agreed in advance',
    text: 'Hosting and practical help as your workflow grows.',
    items: [
      'A separate instance, hosting and backups',
      'Updates and support within your scope',
    ],
    href: '/managed-hosting#request',
    cta: 'Discuss a service plan',
  },
]
const questions = [
  {
    q: 'Is anything locked behind a paid software plan?',
    a: `No. Outbound OS is open source under ${site.license}. The paid offer is setup, hosting and assistance. You can run the complete software yourself.`,
  },
  {
    q: 'What will I pay besides the software?',
    a: 'Depending on your setup, infrastructure, Meta WhatsApp messages and email or other providers may charge you. A managed-service proposal will state which infrastructure costs are included and which costs are billed separately.',
  },
  {
    q: 'Why is there no fixed hosting price?',
    a: 'The work depends on team size, channels, imports, infrastructure and support needs. We separate one-time work from recurring services and agree the price before starting.',
  },
  {
    q: 'Can I bring my own server?',
    a: 'Yes. Setup help can be for infrastructure you control. You can also choose managed hosting, or install the software yourself using the documentation.',
  },
]
export default function PricingPage() {
  return (
    <>
      <section className="section section--lead os-service-hero">
        <div className="page">
          <Breadcrumbs trail={[{ name: 'Pricing', path: '/pricing' }]} />
          <p className="eyebrow">Choose how you want to run it</p>
          <h1>
            Free software.
            <br />
            Expert help when you need it.
          </h1>
          <p className="lede">
            Every product feature is open source. Pay for the work you want us to handle: setup,
            hosting, support or a combination that fits your team.
          </p>
          <div className="pricing-choice">
            <article className="pricing-license" aria-labelledby="self-hosted-heading">
              <span className="pricing-choice__icon"><Code2 size={21} aria-hidden="true" /></span>
              <p className="eyebrow">The software</p>
              <h2 id="self-hosted-heading">Self-hosted. Complete.</h2>
              <p className="pricing-license__price">$0 <span>software licence</span></p>
              <p>Run Outbound OS on infrastructure you control, using your own business accounts.</p>
              <ul className="pricing-inclusions">
                {['Every open-source feature', 'No per-seat software fee', 'Your database and channel accounts', 'Community help on GitHub'].map((item) => (
                  <li key={item}><Check size={15} aria-hidden="true" />{item}</li>
                ))}
              </ul>
              <Link href="/docs/install" className="btn btn--primary">Install Outbound OS <ArrowRight size={15} aria-hidden="true" /></Link>
              <p className="pricing-license__note">Infrastructure and provider usage are separate. Released under {site.license}.</p>
            </article>
            <div className="pricing-help">
              <div className="pricing-help__intro">
                <p className="eyebrow">Optional services</p>
                <h2>Choose the work you want help with.</h2>
                <p>Both options use the same open-source product. We quote for the scope of the work.</p>
              </div>
              {services.map((service) => {
                const Icon = service.icon
                return (
                  <article className="pricing-service" key={service.name}>
                    <div className="pricing-service__heading"><Icon size={18} aria-hidden="true" /><h3>{service.name}</h3></div>
                    <p className="pricing-service__billing">{service.billing}</p>
                    <p>{service.text}</p>
                    <ul className="pricing-inclusions">{service.items.map((item) => <li key={item}><Check size={14} aria-hidden="true" />{item}</li>)}</ul>
                    <Link href={service.href} className="cta-link">{service.cta}<ArrowRight size={14} aria-hidden="true" /></Link>
                  </article>
                )
              })}
            </div>
          </div>
        </div>
      </section>
      <section className="section section--ruled section--raised">
        <div className="page split">
          <div className="section-head">
            <p className="eyebrow">Clear costs, up front</p>
            <h2>
              Your proposal should
              <br />
              make the costs clear.
            </h2>
            <p>We agree the scope before starting. You decide what you want us to handle.</p>
          </div>
          <div className="points">
            <div>
              <h3>One-time setup</h3>
              <p>Installation, connections, imports and onboarding agreed for your project.</p>
            </div>
            <div>
              <h3>Recurring services</h3>
              <p>Hosting, backups, updates and assistance as described in your service plan.</p>
            </div>
            <div>
              <h3>Third-party providers</h3>
              <p>
                Meta messaging, email providers and other usage charges. These remain separate
                unless explicitly included in your quote.
              </p>
            </div>
          </div>
        </div>
      </section>
      <Faq items={questions} heading="Pricing, without the guesswork." />
    </>
  )
}
