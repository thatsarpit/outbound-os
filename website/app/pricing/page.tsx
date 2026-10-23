import Link from 'next/link'
import { ArrowRight, Check } from 'lucide-react'
import { Breadcrumbs, Faq } from '@/components/content'
import { buildMetadata } from '@/lib/metadata'
import { site } from '@/lib/site-content'

export const metadata = buildMetadata(
  'Pricing: free software, optional expert help',
  'Self-host the complete Outbound OS CRM for free. Get a quote for installation, Meta WhatsApp setup, managed hosting or ongoing support. Provider fees are separate.',
  '/pricing',
)
const options = [
  {
    eyebrow: 'Do it yourself',
    name: 'Self-hosted',
    price: '$0',
    suffix: ' software licence',
    text: 'The complete product, on infrastructure you control.',
    items: [
      'Every open-source feature',
      'No per-seat software fee',
      'Your Meta and email accounts',
      'Community support on GitHub',
    ],
    href: '/docs/install',
    cta: 'Install Outbound OS',
  },
  {
    eyebrow: 'Let us get you started',
    name: 'Setup & launch',
    price: 'Custom quote',
    suffix: ' one-time project',
    text: 'A working setup, connected to the way your team sells.',
    items: [
      'Installation and channel setup',
      'Contact import assistance',
      'Lead-source configuration',
      'Testing and a team walkthrough',
    ],
    href: '/managed-hosting#request',
    cta: 'Get a setup quote',
  },
  {
    eyebrow: 'Let us help run it',
    name: 'Managed & supported',
    price: 'Custom quote',
    suffix: ' agreed service plan',
    text: 'Hosting and practical help as your workflow grows.',
    items: [
      'A separate team instance',
      'Agreed hosting and backups',
      'Update management',
      'Ongoing support within your scope',
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
          <div className="os-service-cards">
            {options.map((option, i) => (
              <article
                className={`os-service-card ${i === 1 ? 'os-service-card--featured' : ''}`}
                key={option.name}
              >
                <p className="eyebrow">{option.eyebrow}</p>
                <h2>{option.name}</h2>
                <p>{option.text}</p>
                <p className="os-price">
                  {option.price}
                  <small>{option.suffix}</small>
                </p>
                <ul>
                  {option.items.map((item) => (
                    <li key={item}>
                      <Check size={13} />
                      {item}
                    </li>
                  ))}
                </ul>
                <Link
                  href={option.href}
                  className={`btn ${i === 1 ? 'btn--primary' : 'btn--secondary'}`}
                >
                  {option.cta}
                  <ArrowRight size={14} />
                </Link>
              </article>
            ))}
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
