import Link from 'next/link'
import { ArrowRight, Database, GitFork, Wallet } from 'lucide-react'
import { FirstTouch } from '@/components/visuals/first-touch'
import { IntegrationHub } from '@/components/visuals/integration-hub'
import { LogoMarquee } from '@/components/visuals/logo-marquee'
import { OperatingLoop } from '@/components/visuals/operating-loop'
import { Faq, InstallBand } from '@/components/content'
import { ProductTour } from '@/components/product-tour'
import { integrations } from '@/lib/integrations'
import { mcpToolCount } from '@/lib/mcp-tools'
import { site } from '@/lib/site-content'

/**
 * Home.
 *
 * Opens on what the software does and that it is yours to run: an
 * open-source WhatsApp CRM that contacts a new lead in seconds and keeps
 * following up until they answer. Every section after the hero is proof —
 * the real dashboard, the loop, what it connects to, and where its limits are.
 */

const homeFaq = [
  {
    q: 'What is Outbound OS?',
    a: 'Outbound OS is an open-source CRM and outreach platform built around WhatsApp. It captures leads from website forms, ads and marketplaces, contacts each one on WhatsApp, email, Telegram or iMessage within seconds, runs follow-ups that stop when the lead replies, and keeps the whole conversation on one lead record.',
  },
  {
    q: 'Is Outbound OS free?',
    a: 'Yes. The software is free and open source under the AGPL-3.0 license, with no per-seat or per-contact fees. You pay for your own server and for what channel providers charge — Meta bills WhatsApp template messages to your WhatsApp Business account directly.',
  },
  {
    q: 'Do I need the WhatsApp Business API?',
    a: "Yes, for WhatsApp. Outbound OS sends through Meta's official WhatsApp Cloud API, which you can connect yourself in about fifteen minutes, or through AiSensy if your number is already there. It never automates the WhatsApp or WhatsApp Business phone apps, which is how numbers get banned.",
  },
  {
    q: 'What do I need to run it?',
    a: 'A machine with Docker — a small cloud server with 1–2 GB of memory is enough for a team — and an HTTPS address so Meta can deliver replies. One docker compose command starts the app, creates the database and your first admin account.',
  },
  {
    q: 'Does it work outside India?',
    a: 'Yes. Numbers are stored with their country code, follow-ups run in each lead’s own working hours, and the time zone, currency and default country code are settings. IndiaMART is one of many lead sources, not a requirement.',
  },
  {
    q: 'Is there a hosted version?',
    a: 'The project is built to be self-hosted. If you would rather not run a server, the maintainers can set up and run an instance for you — see managed hosting.',
  },
]

const INTEGRATION_COUNT = integrations.length + 2 // + website forms and MCP

export default function HomePage() {
  return (
    <>
      <section className="section section--lead home-hero-section hero-ground">
        <div className="page split home-hero">
          <div className="hero">
            <a href={site.releasesUrl} className="hero__badge">
              <span className="hero__badge-tag">v{site.version}</span>
              Open source under {site.license}
              <ArrowRight size={13} aria-hidden="true" />
            </a>
            <h1>
              Answer every lead <span className="text-brand">in seconds</span>. Follow up until they reply.
            </h1>
            <p className="lede">
              Outbound OS is the open-source WhatsApp CRM. It captures leads
              from your website, ads and marketplaces, messages each one on
              WhatsApp, email, Telegram or iMessage the moment it arrives, and
              keeps following up until they answer — on your own server.
            </p>

            <div className="hero__actions">
              <Link href="/docs/install" className="btn btn--primary btn--lg">
                Install in five minutes
              </Link>
              <a href={site.githubUrl} className="cta-link">
                Star it on GitHub
                <ArrowRight size={15} aria-hidden="true" />
              </a>
            </div>

            <ul className="hero__facts" aria-label="At a glance">
              <li>Free forever</li>
              <li>One Docker command</li>
              <li>Meta&rsquo;s official WhatsApp API</li>
            </ul>
          </div>

          <FirstTouch />
        </div>
      </section>

      <section className="section section--tight" aria-label="At a glance">
        <div className="page">
          <div className="stats">
            <div>
              <span className="stats__value stats__value--brand">Seconds</span>
              <span className="stats__label">from new lead to first WhatsApp</span>
            </div>
            <div>
              <span className="stats__value">4</span>
              <span className="stats__label">channels on one lead</span>
            </div>
            <div>
              <span className="stats__value">{INTEGRATION_COUNT}</span>
              <span className="stats__label">integrations built in</span>
            </div>
            <div>
              <span className="stats__value">{mcpToolCount}</span>
              <span className="stats__label">tools for AI agents</span>
            </div>
            <div>
              <span className="stats__value">$0</span>
              <span className="stats__label">license, seats or per-contact fees</span>
            </div>
          </div>
          <div className="home-marquee">
            <LogoMarquee />
          </div>
        </div>
      </section>

      {/* The real dashboard, one screen at a time. */}
      <section className="section section--ruled" aria-labelledby="shot-heading">
        <div className="page">
          <div className="section-head">
            <p className="eyebrow">The product</p>
            <h2 id="shot-heading">One screen for the whole pipeline.</h2>
            <p>
              Real screens from the open-source release. Click through the
              parts you would use every day.
            </p>
          </div>
          <ProductTour />
        </div>
      </section>

      <section className="section section--ruled">
        <div className="page">
          <div className="section-head">
            <p className="eyebrow">How it works</p>
            <h2>From enquiry to reply without anyone watching the queue.</h2>
            <p>
              The slow part of selling is rarely the first message. It is the
              second, third and fourth — so the system owns them.
            </p>
          </div>

          <OperatingLoop className="home-loop" />

          <ol className="steps">
            <li>
              <span className="steps__n tabular">01</span>
              <div>
                <h3>Capture from anywhere</h3>
                <p>
                  Website forms, <Link href="/integrations/facebook-lead-ads">Facebook Lead Ads</Link>,{' '}
                  <Link href="/integrations/indiamart">IndiaMART</Link>, Zapier, CSV. Every
                  source is a webhook with a field map, and duplicates merge
                  into the lead that already exists.
                </p>
              </div>
            </li>
            <li>
              <span className="steps__n tabular">02</span>
              <div>
                <h3>First contact in seconds</h3>
                <p>
                  The moment a lead arrives, it gets your approved WhatsApp
                  template and an email — not when someone next opens the
                  dashboard.
                </p>
              </div>
            </li>
            <li>
              <span className="steps__n tabular">03</span>
              <div>
                <h3>Follow-ups that know when to stop</h3>
                <p>
                  Sequences run in the lead&rsquo;s own working hours and end on a
                  reply, an opt-out or a closed deal. A live conversation never
                  gets another scheduled chase.
                </p>
              </div>
            </li>
            <li>
              <span className="steps__n tabular">04</span>
              <div>
                <h3>One inbox for every channel</h3>
                <p>
                  WhatsApp, email, Telegram and iMessage threads sit side by
                  side on the lead they belong to, with owner, status, notes
                  and tasks.
                </p>
              </div>
            </li>
            <li>
              <span className="steps__n tabular">05</span>
              <div>
                <h3>Close, and keep the customer</h3>
                <p>
                  Pipeline, orders and shipment updates live on the same record
                  as the conversation, so a repeat order starts with the whole
                  history.
                </p>
              </div>
            </li>
          </ol>
        </div>
      </section>

      <section className="section section--ruled section--raised">
        <div className="page">
          <div className="section-head">
            <p className="eyebrow">Why self-hosted</p>
            <h2>Your leads, your server, your WhatsApp account.</h2>
          </div>
          <div className="grid grid--3 home-why">
            <article>
              <span className="icon-chip" aria-hidden="true"><Database size={18} /></span>
              <h3>Your data stays in your database</h3>
              <p>
                Contacts, conversations and credentials live on a server you
                control. Export everything to CSV whenever you like.
              </p>
            </article>
            <article>
              <span className="icon-chip" aria-hidden="true"><Wallet size={18} /></span>
              <h3>No per-seat or per-contact fees</h3>
              <p>
                Add your whole team and every lead you have. The software costs
                nothing; Meta bills template messages to your own account.
              </p>
            </article>
            <article>
              <span className="icon-chip" aria-hidden="true"><GitFork size={18} /></span>
              <h3>Change anything</h3>
              <p>
                The code is on GitHub under {site.license}. Add a lead source,
                a channel or a report, and send it upstream if others need it.
              </p>
            </article>
          </div>
          <p className="home-why__more">
            <Link href="/self-hosted-crm" className="cta-link">
              Why teams self-host their CRM
              <ArrowRight size={15} aria-hidden="true" />
            </Link>
          </p>
        </div>
      </section>

      <section className="section section--ruled" aria-labelledby="connects-heading">
        <div className="page">
          <div className="section-head">
            <p className="eyebrow">Integrations</p>
            <h2 id="connects-heading">Connects to where your leads already are.</h2>
            <p>Every integration below ships in the open-source release. Nothing is a paid add-on.</p>
          </div>
          <IntegrationHub />
          <p className="home-why__more">
            <Link href="/integrations" className="cta-link">
              All integrations
              <ArrowRight size={15} aria-hidden="true" />
            </Link>
          </p>
        </div>
      </section>

      <section className="section section--night">
        <div className="page split split--reverse home-mcp">
          <div className="mcp-example panel">
            <div className="mcp-example__line">
              <span className="mcp-example__speaker">You</span>
              <p>Which leads from last week&rsquo;s trade show haven&rsquo;t replied?</p>
            </div>
            <div className="mcp-example__line">
              <span className="mcp-example__speaker">Agent</span>
              <p>
                Reads the live CRM, lists the leads with no reply, and offers to
                draft a follow-up campaign for your approval.
              </p>
            </div>
            <div className="mcp-example__tools mono">list_leads → lead_timeline → create_campaign</div>
          </div>

          <div className="section-head">
            <p className="eyebrow">MCP for AI agents</p>
            <h2>Let Claude work your CRM, not a spreadsheet export.</h2>
            <p>
              Outbound OS ships an MCP server. Claude and other MCP clients can
              search leads, read timelines, import lists, build campaigns and
              pull analytics from your live data.
            </p>
            <p>
              Sending and deleting are real actions, so they stay behind the
              same approvals you would give a person.
            </p>
            <Link href="/mcp" className="cta-link">
              What agents can do
              <ArrowRight size={15} aria-hidden="true" />
            </Link>
          </div>
        </div>
      </section>

      <section className="section section--ruled">
        <div className="page split split--reverse">
          <div className="stack home-limits">
            <article>
              <h3>It does not bypass WhatsApp&rsquo;s rules</h3>
              <p>
                Messages go through Meta&rsquo;s official Cloud API or a Meta
                partner. Template approval, opt-in and the 24-hour window all
                apply. Anything that promises otherwise is asking you to lose
                your number.
              </p>
            </article>
            <article>
              <h3>It does not blast</h3>
              <p>
                Daily limits and warm-up are built in per number and per
                mailbox. The design assumes you want replies, not volume.
              </p>
            </article>
            <article>
              <h3>It does not decide for you</h3>
              <p>
                Price, terms and whether a lead is worth pursuing stay with the
                person who owns the deal. Automation handles the chasing.
              </p>
            </article>
          </div>

          <div className="section-head">
            <p className="eyebrow">Where the line is</p>
            <h2>What it deliberately doesn&rsquo;t do.</h2>
            <p>Worth knowing before you install it, not after.</p>
          </div>
        </div>
      </section>

      <InstallBand />

      <Faq items={homeFaq} />
    </>
  )
}
