import Link from 'next/link'
import {
  ArrowRight,
  ArrowUpRight,
  Check,
  GitBranch,
  Inbox,
  MessageCircle,
  Server,
  ShieldCheck,
  SlidersHorizontal,
  Workflow,
} from 'lucide-react'
import { Logo } from '@/components/brand-logo'
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
          <Link href="/managed-hosting" className="os-announcement">
            <span className="os-status-dot" /> Open source. Expert setup available.{' '}
            <ArrowRight size={14} />
          </Link>
          <div className="os-hero__intro">
            <div>
              <p className="eyebrow">The open-source WhatsApp CRM</p>
              <h1 id="home-heading">
                Good conversations.
                <br />
                <span>Better business.</span>
              </h1>
            </div>
            <div className="os-hero__right">
              <p>
                Bring your leads, WhatsApp conversations and sales workflow into one place. Run it
                yourself, or let us get your team up and running.
              </p>
              <div className="os-actions">
                <Link href="/managed-hosting" className="btn btn--primary btn--lg">
                  Set it up for me <ArrowUpRight size={17} />
                </Link>
                <a href={site.demoUrl} className="btn btn--secondary btn--lg">
                  Explore the demo <ArrowRight size={16} />
                </a>
              </div>
              <a className="os-source-link" href={site.githubUrl}>
                <GitBranch size={14} /> Free to self-host · {site.license}{' '}
                <ArrowUpRight size={13} />
              </a>
            </div>
          </div>
          <div className="os-product-stage">
            <div className="os-product-stage__bar">
              <span>
                <i />
                <i />
                <i />
              </span>
              <span>outboundos / workspace</span>
              <span>
                <span className="os-status-dot" /> Your team, connected
              </span>
            </div>
            <div className="os-product-stage__image">
              <picture>
                <source
                  type="image/webp"
                  srcSet={`/screenshots/inbox-800.webp?v=${site.screenshotVersion} 800w, /screenshots/inbox.webp?v=${site.screenshotVersion} 1600w`}
                  sizes="(max-width: 800px) 100vw, 1180px"
                />
                <img
                  src={`/screenshots/inbox.webp?v=${site.screenshotVersion}`}
                  alt="Outbound OS shared inbox with a WhatsApp conversation, customer details and reply composer"
                  width="1600"
                  height="1000"
                  fetchPriority="high"
                />
              </picture>
            </div>
            <div className="os-product-stage__caption">
              <span>
                <span className="os-status-dot" /> The actual product. Example workspace data.
              </span>
              <a href={site.demoUrl}>
                Take a look around <ArrowUpRight size={13} />
              </a>
            </div>
          </div>
          <div className="os-connections">
            <p>Fits the way you already work</p>
            <div>
              {(['whatsapp', 'meta', 'gmail', 'indiamart', 'facebook', 'mcp'] as const).map(
                (brand) => (
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
                ),
              )}
            </div>
          </div>
        </div>
      </section>

      <section className="section os-workflow" aria-labelledby="workflow-heading">
        <div className="page">
          <div className="os-section-heading">
            <div>
              <p className="eyebrow">Less switching. More selling.</p>
              <h2 id="workflow-heading">
                A place for every lead.
                <br />A clear next step for your team.
              </h2>
            </div>
            <p>
              Your inbox, campaigns and pipeline share the same customer record. The context comes
              with the conversation.
            </p>
          </div>
          <div className="os-feature-grid">
            <article className="os-feature os-feature--wide">
              <div className="os-feature__icon">
                <Inbox size={21} />
              </div>
              <h3>One inbox. The whole conversation.</h3>
              <p>
                Read WhatsApp and email threads alongside customer details, notes and ownership.
                Your team can pick up where the last person left off.
              </p>
              <Link href="/platform" className="cta-link">
                Explore the workspace <ArrowRight size={14} />
              </Link>
              <div className="os-mini-thread" aria-label="Example conversation">
                <div>
                  <span className="os-avatar">JT</span>
                  <span>
                    <strong>Jamie Taylor</strong>
                    <small>WhatsApp · example contact</small>
                  </span>
                  <span className="os-thread-state">Replied</span>
                </div>
                <p>Could you send the details for our next order?</p>
                <div className="os-thread-note">
                  <ShieldCheck size={14} /> Reply received. Scheduled follow-ups stop.
                </div>
              </div>
            </article>
            <article className="os-feature">
              <div className="os-feature__icon">
                <MessageCircle size={21} />
              </div>
              <h3>Your number. Direct to Meta.</h3>
              <p>
                Connect your own WhatsApp Business account. Use approved templates for outreach and
                see delivery receipts in the conversation.
              </p>
              <Link href="/integrations/whatsapp-cloud-api" className="cta-link">
                How it connects <ArrowRight size={14} />
              </Link>
              <div className="os-meta-card">
                <Logo brand="meta" size={38} />
                <div>
                  <strong>Meta Cloud API</strong>
                  <span>Official WhatsApp connection</span>
                </div>
                <Check size={18} />
              </div>
            </article>
            <article className="os-feature">
              <div className="os-feature__icon">
                <Workflow size={21} />
              </div>
              <h3>Turn interest into a workflow.</h3>
              <p>
                Capture enquiries from forms, ads and marketplaces. Organise owners, campaigns and
                orders around the lead.
              </p>
              <Link href="/integrations" className="cta-link">
                See the integrations <ArrowRight size={14} />
              </Link>
              <ol className="os-pipeline">
                <li>New enquiry</li>
                <li>Conversation</li>
                <li>Order</li>
              </ol>
            </article>
          </div>
        </div>
      </section>

      <section className="section os-service-section" aria-labelledby="services-heading">
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
                You don&rsquo;t need to become a server administrator to use open-source software.
                Tell us how your team works. We&rsquo;ll help make Outbound OS fit.
              </p>
              <Link href="/managed-hosting" className="btn btn--lime btn--lg">
                Let&rsquo;s plan your setup <ArrowUpRight size={17} />
              </Link>
              <span className="os-service-note">Clear scope. A quote before work starts.</span>
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
                Real screens.
                <br />A workspace that makes sense.
              </h2>
            </div>
            <p>
              Explore the current interface, then try it with example data. No sign-in needed for
              the demo.
            </p>
          </div>
          <ProductTour />
        </div>
      </section>

      <section className="section os-ownership" aria-labelledby="ownership-heading">
        <div className="page os-ownership__grid">
          <div>
            <p className="eyebrow">Open source, all the way through</p>
            <h2 id="ownership-heading">
              The software is yours.
              <br />
              The help is your choice.
            </h2>
            <p>
              Read the code, run your own instance and keep your customer data under your control.
              Our paid service is the work of setting it up and keeping it running.
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
      <Faq items={questions} heading="A few things, answered." />
      <section className="os-final">
        <div className="page">
          <p className="eyebrow">Your next chapter starts here</p>
          <h2>
            Give your conversations
            <br />
            somewhere to grow.
          </h2>
          <div className="os-actions">
            <Link href="/managed-hosting" className="btn btn--primary btn--lg">
              Talk about your setup <ArrowUpRight size={17} />
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
