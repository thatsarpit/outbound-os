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
import { WorkflowStory } from '@/components/workflow-story'
import { MobileShowcase } from '@/components/mobile-showcase'
import { CaptureVisual, FollowVisual, ReplyVisual } from '@/components/visuals/story-visuals'
import { IntegrationHub } from '@/components/visuals/integration-hub'
import { AgentExchange } from '@/components/visuals/agent-exchange'
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
                Every conversation,
                <br />
                <span>one place to act.</span>
              </h1>
            </div>
            <div className="os-hero__right">
              <p>
                WhatsApp, email and customer records in one shared workspace.
                Read the history. Find the next step. Keep the conversation moving, at your desk or on your phone.
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
                  'webhooks',
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
                        webhooks: 'Webhooks',
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

      <section className="section os-product-story" aria-labelledby="story-heading">
        <div className="page">
          <div className="os-section-heading" data-reveal>
            <div><p className="eyebrow">From first enquiry to the next reply</p><h2 id="story-heading">A workflow that keeps<br />the conversation moving.</h2></div>
            <p>Bring in the lead, follow up with control, and hand the conversation to a person when the customer answers.</p>
          </div>
          <WorkflowStory steps={[
            { label: 'Capture', title: 'A customer record, from the first hello.', text: 'Bring in enquiries from forms, Facebook Lead Ads and signed webhooks. Keep source details with the record, and merge a repeat enquiry into the existing lead.', visual: <CaptureVisual /> },
            { label: 'Follow up', title: 'A clear next step. A sensible rhythm.', text: 'Set your follow-up steps, sending hours and connected channels. Consent, opt-outs, approved templates and provider rules determine what can send.', visual: <FollowVisual /> },
            { label: 'Take over', title: 'They reply. Your team takes it from here.', text: 'A customer reply stops scheduled follow-ups and appears in the inbox. Read the history, pick up the thread and keep the customer’s context close.', visual: <ReplyVisual /> },
          ]} />
          <p className="os-visual-note">Workflow examples shown with sample records. Your configured rules control sending.</p>
        </div>
      </section>

      <section className="section" aria-labelledby="product-heading">
        <div className="page">
          <div className="os-section-heading">
            <div>
              <p className="eyebrow">Look inside</p>
              <h2 id="product-heading">
                Your working day.
                <br />
                In full view.
              </h2>
            </div>
            <p>
              Actual product screens, from the full desktop workspace to a
              focused mobile conversation. Try the demo to use it yourself.
            </p>
          </div>
          <ProductTour />
        </div>
      </section>

      <section className="section section--ruled os-mobile-section" aria-label="Outbound OS on your phone">
        <div className="page"><MobileShowcase /></div>
      </section>

      <section className="section section--ruled os-connections-section" aria-labelledby="connections-heading">
        <div className="page">
          <div className="os-section-heading" data-reveal><div><p className="eyebrow">Your tools. One working system.</p><h2 id="connections-heading">Connected around<br />the customer.</h2></div><p>Use your own business accounts. Bring enquiries into the workspace and connect the channels your team already uses.</p></div>
          <IntegrationHub />
          <div className="os-section-link"><Link className="cta-link" href="/integrations">Explore every integration <ArrowRight size={15} /></Link></div>
        </div>
      </section>

      <section className="section section--ruled" aria-labelledby="agent-heading">
        <div className="page split os-agent">
          <div className="section-head" data-reveal><p className="eyebrow">An open workspace for your AI tools</p><h2 id="agent-heading">Ask your CRM.<br />Then choose the next move.</h2><p>Connect an MCP client to inspect leads, read conversations and work with campaigns through the product&rsquo;s tools. Your assistant gets the context. You decide what to do with it.</p><Link className="cta-link" href="/mcp">Meet the MCP server <ArrowRight size={15} /></Link><p className="os-visual-note">Example exchange with sample records.</p></div>
          <div data-reveal><AgentExchange /></div>
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
      <section className="section os-setup-strip" aria-labelledby="setup-heading">
        <div className="page"><div className="setup-strip"><div><p className="eyebrow">A little help getting started</p><h2 id="setup-heading">Your business. Your instance.<br />We can handle the setup.</h2><p>Installation, channel connections, contact imports and a team walkthrough. Hosting and ongoing support are optional, with a scope and quote agreed first.</p></div><Link href="/managed-hosting" className="btn btn--primary btn--lg">Plan your setup <ArrowUpRight size={16} /></Link></div></div>
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
