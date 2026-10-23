import Link from 'next/link'
import { ArrowRight, Check } from 'lucide-react'
import { buildMetadata } from '@/lib/metadata'
import { site } from '@/lib/site-content'
import { DemoForm } from '@/components/demo-form'
import { Breadcrumbs, Faq } from '@/components/content'
import { JsonLd } from '@/components/json-ld'
import { graph, managedServiceLd } from '@/lib/structured-data'

export const metadata = buildMetadata(
  'WhatsApp CRM setup, hosting & support',
  'Get Outbound OS installed and connected to Meta WhatsApp, email and your lead sources. Paid setup, managed hosting and ongoing help, quoted for your team.',
  '/managed-hosting',
)
const services = [
  {
    label: 'One-time project',
    title: 'Setup & launch',
    description: 'Get from an empty server to a workspace your team can use.',
    items: [
      'Installation and HTTPS configuration',
      'Direct Meta WhatsApp connection',
      'Email and lead-source configuration',
      'Contact import and team walkthrough',
    ],
  },
  {
    label: 'Ongoing service',
    title: 'Managed hosting',
    description: 'Use Outbound OS with the infrastructure work handled for you.',
    items: [
      'A separate instance for your team',
      'Hosting and update management',
      'Backup and recovery arrangements',
      'Support scope agreed in your proposal',
    ],
  },
  {
    label: 'As you grow',
    title: 'Ongoing assistance',
    description: 'Get practical help from the people working on the product.',
    items: [
      'Templates and campaign configuration',
      'Workflow troubleshooting',
      'Help connecting new lead sources',
      'Custom work scoped separately',
    ],
  },
]
const questions = [
  {
    q: 'How much does it cost?',
    a: 'We quote after understanding your team, channels, hosting needs and any migration work. One-time setup and recurring services are separated in the proposal. There is no commitment just for sending an enquiry.',
  },
  {
    q: 'Who owns the Meta account and customer data?',
    a: 'You use your own business accounts and retain access to your customer records. We agree access and hosting arrangements before setup, and can scope a handover if you later choose to self-host.',
  },
  {
    q: 'Are messaging fees and hosting included?',
    a: 'The quote states what is included. Meta messaging, email providers and other third-party charges are identified separately. We do not promise free or unlimited infrastructure.',
  },
  {
    q: 'Can you move us from an existing provider?',
    a: 'We can assess the current number, templates and available contact or chat exports. Migration depends on Meta and the existing provider; we confirm the path before changing your setup. Complete chat history recovery is not guaranteed.',
  },
]
export default function ManagedHostingPage() {
  return (
    <>
      <JsonLd data={graph(managedServiceLd())} />
      <section className="section section--lead os-service-hero">
        <div className="page">
          <Breadcrumbs trail={[{ name: 'Setup & hosting', path: '/managed-hosting' }]} />
          <p className="eyebrow">The product is open source. The work is what we do.</p>
          <h1>
            Your workflow.
            <br />
            Our help getting it live.
          </h1>
          <p className="lede">
            We set up Outbound OS around the way your business handles enquiries. Choose a one-time
            launch, managed hosting or ongoing assistance. You get a clear scope and quote before
            any work starts.
          </p>
          <div className="os-actions">
            <a href="#request" className="btn btn--primary btn--lg">
              Tell us about your team <ArrowRight size={16} />
            </a>
            <Link href="/docs/install" className="cta-link">
              I&rsquo;ll self-host <ArrowRight size={14} />
            </Link>
          </div>
          <div className="os-service-cards">
            {services.map((service, i) => (
              <article
                className={`os-service-card ${i === 1 ? 'os-service-card--featured' : ''}`}
                key={service.title}
              >
                <p className="eyebrow">{service.label}</p>
                <h2>{service.title}</h2>
                <p>{service.description}</p>
                <ul>
                  {service.items.map((item) => (
                    <li key={item}>
                      <Check size={13} />
                      {item}
                    </li>
                  ))}
                </ul>
                <a href="#request" className={`btn ${i === 1 ? 'btn--primary' : 'btn--secondary'}`}>
                  Discuss {service.title.toLowerCase()} <ArrowRight size={14} />
                </a>
              </article>
            ))}
          </div>
        </div>
      </section>
      <section className="section section--ruled section--raised os-request" id="request">
        <div className="page split">
          <aside>
            <p className="eyebrow">Start with a conversation</p>
            <h2>
              What would make your
              <br />
              sales day easier?
            </h2>
            <p className="lede">
              Tell us what you use now and where things get stuck. We&rsquo;ll help work out the
              right setup.
            </p>
            <ol>
              <li>
                <strong>Understand your workflow.</strong> Your channels, team and current tools.
              </li>
              <li>
                <strong>Agree the plan.</strong> Scope, access, costs and any migration needs.
              </li>
              <li>
                <strong>Set up and verify.</strong> Connect the agreed channels and test with your
                team.
              </li>
            </ol>
            <h3>Prefer email?</h3>
            <p>
              <a href={`mailto:${site.email}`} className="link">
                {site.email}
              </a>
            </p>
            <p>
              Looking for community help? Visit{' '}
              <a href={site.discussionsUrl} className="link">
                GitHub Discussions
              </a>
              .
            </p>
          </aside>
          <div className="panel">
            <DemoForm toEmail={site.email} />
          </div>
        </div>
      </section>
      <Faq items={questions} heading="Before we get started." />
    </>
  )
}
