import Link from 'next/link'
import {
  ArrowRight,
  ArrowUpRight,
  GitBranch,
  Server,
  SlidersHorizontal,
} from 'lucide-react'
import { Logo } from '@/components/brand-logo'
import { ProductHero } from '@/components/product-hero'
import { ProductTour } from '@/components/product-tour'
import { Faq } from '@/components/content'
import { site } from '@/lib/site-content'

const questions = [
  {
    q: 'Is Outbound OS free?',
    a: 'Yes. The complete software is open source under AGPL-3.0. You can install it yourself without a software subscription. Hosting, WhatsApp messaging and other providers can have their own costs.',
  },
  {
    q: 'What can you set up for my business?',
    a: 'We offer installation, a direct Meta WhatsApp connection, email and lead-source setup, contact imports and a team walkthrough. Managed hosting and ongoing assistance are also available. We agree the scope and quote before work starts.',
  },
  {
    q: 'Can I keep my existing WhatsApp number?',
    a: 'We first check your current number and Meta Business account. A number already connected through another provider may need a migration. We plan that with you before making changes.',
  },
  {
    q: 'Does this include the WhatsApp messaging fees?',
    a: 'Software and setup services are separate from Meta messaging charges and other provider costs. Your proposal will explain which infrastructure costs are included and which are billed separately.',
  },
  {
    q: 'Can I move to self-hosting later?',
    a: 'Yes. Managed setup uses the same open-source product. You can export your data and run your own instance. We can include a handover in your service scope.',
  },
]

export default function HomePage() {
  return (
    <>
      <section className="os-hero" aria-labelledby="home-heading">
        <div className="page">
          <div className="os-hero__intro">
            <div>
              <p className="eyebrow">
                Outbound OS / The open-source WhatsApp CRM
              </p>
              <h1 id="home-heading">
                Your sales desk,
                <br />
                <span>wherever you work.</span>
              </h1>
            </div>
            <div className="os-hero__right">
              <p>
                WhatsApp, email and customer records in one shared workspace.
                The full picture at your desk. A focused inbox on your phone.
              </p>
              <div className="os-actions">
                <a href={site.demoUrl} className="btn btn--primary btn--lg">
                  Try the live demo <ArrowUpRight size={17} />
                </a>
                <Link
                  href="/managed-hosting"
                  className="btn btn--secondary btn--lg"
                >
                  Get setup help <ArrowRight size={16} />
                </Link>
              </div>
              <a className="os-source-link" href={site.githubUrl}>
                <GitBranch size={14} /> Open source · Free to self-host
                <ArrowUpRight size={13} />
              </a>
            </div>
          </div>
          <ProductHero />
          <div className="os-connections">
            <p>Connected to the tools you work with</p>
            <div>
              {(
                [
                  'whatsapp',
                  'meta',
                  'gmail',
                  'indiamart',
                  'facebook',
                  'mcp',
                ] as const
              ).map((brand) => (
                <span key={brand}>
                  <Logo brand={brand} size={23} />
                  {
                    (
                      {
                        whatsapp: 'WhatsApp',
                        meta: 'Meta Cloud API',
                        gmail: 'Email',
                        indiamart: 'IndiaMART',
                        facebook: 'Facebook Leads',
                        mcp: 'MCP agents',
                      } as const
                    )[brand]
                  }
                </span>
              ))}
            </div>
          </div>
        </div>
      </section>

      <section
        className="section os-workflow"
        aria-labelledby="workflow-heading"
      >
        <div className="page os-workflow__layout">
          <div className="os-workflow__intro">
            <p className="eyebrow">The work, connected</p>
            <h2 id="workflow-heading">
              More context.
              <br />
              Fewer loose ends.
            </h2>
            <p>
              An enquiry becomes a conversation. A conversation becomes an
              order. Keep the details together, so the next person knows where
              to start.
            </p>
            <Link href="/platform" className="cta-link">
              Explore the platform <ArrowRight size={15} />
            </Link>
          </div>
          <ol className="os-workflow__list">
            {[
              {
                number: '01',
                title: 'A shared inbox, with the customer attached.',
                text: 'Read WhatsApp and email alongside notes, ownership and previous orders. A reply stops scheduled follow-ups.',
                href: '/platform',
                link: 'Inside the workspace',
              },
              {
                number: '02',
                title: 'Your WhatsApp number. A direct Meta connection.',
                text: 'Use your own Business account, approved templates and delivery receipts. Keep control of the connection.',
                href: '/integrations/whatsapp-cloud-api',
                link: 'How WhatsApp connects',
              },
              {
                number: '03',
                title: 'The next step, wherever the day takes you.',
                text: 'Reply from your phone, check a lead or work through your tasks. Add the web app to your Home Screen for quick access.',
                href: '#product-heading',
                link: 'See the product screens',
              },
            ].map((item) => (
              <li key={item.number}>
                <span className="os-workflow__number">{item.number}</span>
                <div>
                  <h3>{item.title}</h3>
                  <p>{item.text}</p>
                  <Link href={item.href} className="cta-link">
                    {item.link} <ArrowUpRight size={14} />
                  </Link>
                </div>
              </li>
            ))}
          </ol>
        </div>
      </section>

      <section
        className="section os-service-section"
        aria-labelledby="services-heading"
      >
        <div className="page">
          <div className="os-service-panel">
            <div className="os-service-panel__intro">
              <p className="eyebrow">Built by us. Set up for you.</p>
              <h2 id="services-heading">
                You run the business.
                <br />
                We&rsquo;ll handle the setup.
              </h2>
              <p>
                You don&rsquo;t need to become a server administrator to use
                open-source software. Tell us how your team works. We&rsquo;ll
                help make Outbound OS fit.
              </p>
              <Link href="/managed-hosting" className="btn btn--lime btn--lg">
                Let&rsquo;s plan your setup <ArrowUpRight size={17} />
              </Link>
              <span className="os-service-note">
                Clear scope. A quote before work starts.
              </span>
            </div>
            <div className="os-service-list">
              {[
                {
                  n: '01',
                  title: 'Setup & launch',
                  text: 'Installation, channel connections, lead imports and a walkthrough for your team.',
                },
                {
                  n: '02',
                  title: 'Managed hosting',
                  text: 'A separate instance for your team, with hosting, backups and upgrades agreed in your plan.',
                },
                {
                  n: '03',
                  title: 'Ongoing assistance',
                  text: 'Help with templates, workflow configuration, troubleshooting and future improvements.',
                },
              ].map((service) => (
                <div key={service.n}>
                  <span>{service.n}</span>
                  <div>
                    <h3>{service.title}</h3>
                    <p>{service.text}</p>
                  </div>
                  <ArrowUpRight size={19} />
                </div>
              ))}
            </div>
          </div>
        </div>
      </section>

      <section className="section" aria-labelledby="product-heading">
        <div className="page">
          <div className="os-section-heading">
            <div>
              <p className="eyebrow">Look inside</p>
              <h2 id="product-heading">
                Get a feel for
                <br />
                your next workspace.
              </h2>
            </div>
            <p>
              A closer look at the desktop and mobile experience. Every screen
              comes from the product, with example data.
            </p>
          </div>
          <ProductTour />
        </div>
      </section>

      <section
        className="section os-ownership"
        aria-labelledby="ownership-heading"
      >
        <div className="page os-ownership__grid">
          <div>
            <p className="eyebrow">Open source, all the way through</p>
            <h2 id="ownership-heading">
              The software is yours.
              <br />
              The help is your choice.
            </h2>
            <p>
              Read the code, run your own instance and keep your customer data
              under your control. Our paid service is the work of setting it up
              and keeping it running.
            </p>
            <div className="os-actions">
              <Link href="/docs/install" className="btn btn--primary">
                Self-host Outbound OS <ArrowRight size={15} />
              </Link>
              <Link href="/pricing" className="cta-link">
                Compare your options <ArrowRight size={14} />
              </Link>
            </div>
          </div>
          <div className="os-ownership__facts">
            <div>
              <GitBranch size={20} />
              <span>
                <strong>Free software</strong>
                <small>Every feature included under {site.license}.</small>
              </span>
            </div>
            <div>
              <Server size={20} />
              <span>
                <strong>Your own instance</strong>
                <small>Your business accounts and your customer records.</small>
              </span>
            </div>
            <div>
              <SlidersHorizontal size={20} />
              <span>
                <strong>Room to make it yours</strong>
                <small>Configure workflows. Extend the open-source code.</small>
              </span>
            </div>
          </div>
        </div>
      </section>
      <Faq items={questions} heading="Before you get started." />
      <section className="os-final">
        <div className="page">
          <p className="eyebrow">Make it your workspace</p>
          <h2>
            Take a look around.
            <br />
            We can help with the rest.
          </h2>
          <div className="os-actions">
            <Link href="/managed-hosting" className="btn btn--primary btn--lg">
              Get setup help <ArrowUpRight size={17} />
            </Link>
            <a href={site.demoUrl} className="btn btn--secondary btn--lg">
              Try the live demo
            </a>
          </div>
        </div>
      </section>
    </>
  )
}
