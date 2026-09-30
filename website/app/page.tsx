import Link from 'next/link'
import { ArrowRight } from 'lucide-react'
import { HeroScene } from '@/components/visuals/hero-scene'
import { Logo, LogoTile } from '@/components/brand-logo'
import { IntegrationHub } from '@/components/visuals/integration-hub'
import { LogoRow } from '@/components/visuals/logo-row'
import { Bento } from '@/components/visuals/bento'
import { CaptureVisual, CloseVisual, ContactVisual, FollowVisual, ReplyVisual } from '@/components/visuals/story-visuals'
import { StoryScroller } from '@/components/story-scroller'
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
    a: 'Yes. The software is free and open source under the AGPL-3.0 license, with no per-seat or per-contact fees. You pay for your own server and for what channel providers charge — Meta bills WhatsApp messages to your own WhatsApp Business account directly.',
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
      <section className="stage-wrap">
        <div className="stage">
          <div className="page stage__inner">
            <div className="stage__copy">
              {/* On main, not yet in a numbered release: say "New", link the
                  changelog, and don't pin it to a version it isn't in. */}
              <a href={`${site.githubUrl}/blob/main/CHANGELOG.md`} className="stage__badge">
                <b>New</b>
                Photos and files on WhatsApp
                <ArrowRight size={13} aria-hidden="true" />
              </a>
              <h1>
                Answer every lead in seconds. <span>Follow up until they reply.</span>
              </h1>
              <p className="stage__lede">
                The open-source WhatsApp CRM. Leads from your website, ads and
                marketplaces get a WhatsApp message and an email the moment they
                arrive, and a follow-up every morning until they answer.
              </p>
              <div className="stage__actions">
                <Link href="/docs/install" className="btn btn--brand btn--lg">
                  Install in five minutes
                </Link>
                <a href={site.demoUrl} className="btn btn--glass btn--lg">
                  Try the live demo
                  <ArrowRight size={16} aria-hidden="true" />
                </a>
              </div>
              <p className="stage__meta">
                Free under {site.license}. Runs on your own server.{' '}
                <a href={site.githubUrl}>
                  <Logo brand="github" size={14} className="stage__gh" />
                  Star on GitHub
                </a>
              </p>
            </div>

            <HeroScene />
          </div>
        </div>
      </section>

      <section className="home-glance" aria-label="Works with">
        <div className="page">
          <LogoRow caption="Leads come in and messages go out through the tools you already use" />
        </div>
      </section>

      <section className="section section--ruled home-story" aria-labelledby="story-heading">
        <div className="page">
          <div className="section-head" data-reveal>
            <h2 id="story-heading">From enquiry to order, without anyone watching the queue.</h2>
            <p>
              The slow part of selling is rarely the first message. It is the
              second, third and fourth — so the software owns them.
            </p>
          </div>
          <StoryScroller
            steps={[
              {
                eyebrow: 'Capture',
                title: 'Every lead lands in one place',
                body: (
                  <p>
                    Website forms, <Link href="/integrations/facebook-lead-ads">Facebook Lead Ads</Link>,{' '}
                    <Link href="/integrations/indiamart">IndiaMART</Link>, Zapier or a CSV. Each source is a
                    signed webhook, and a lead that already exists is merged, not duplicated.
                  </p>
                ),
                visual: <CaptureVisual />,
                inline: <CaptureVisual />,
              },
              {
                eyebrow: 'Contact',
                title: 'First message in seconds',
                body: (
                  <p>
                    The moment a lead arrives it gets your approved WhatsApp template and an email from your own
                    mailbox — not when someone next opens the dashboard.
                  </p>
                ),
                visual: <ContactVisual />,
                inline: <ContactVisual />,
              },
              {
                eyebrow: 'Follow up',
                title: 'Follow-ups on their morning',
                body: (
                  <p>
                    Sequences are timed for the lead&rsquo;s morning in their own country, so a buyer in Lagos
                    hears from you at 09:30 Lagos time.
                  </p>
                ),
                visual: <FollowVisual />,
                inline: <FollowVisual />,
              },
              {
                eyebrow: 'Reply',
                title: 'A reply stops the chase',
                body: (
                  <p>
                    The moment they answer on any channel, every scheduled follow-up is cancelled and the
                    conversation moves to your team.
                  </p>
                ),
                visual: <ReplyVisual />,
                inline: <ReplyVisual />,
              },
              {
                eyebrow: 'Close',
                title: 'Orders on the same record',
                body: (
                  <p>
                    Orders, invoices and shipment updates live on the lead the conversation started on, so a
                    repeat order starts with the whole history.
                  </p>
                ),
                visual: <CloseVisual />,
                inline: <CloseVisual />,
              },
            ]}
          />
        </div>
      </section>

      <section className="section section--ruled section--raised" aria-labelledby="bento-heading">
        <div className="page">
          <div className="section-head" data-reveal>
            <h2 id="bento-heading">Everything a sales desk needs. Nothing to pay for.</h2>
            <p>All of it ships in the open-source release — no paid tier, no add-ons.</p>
          </div>
          <div data-reveal>
            <Bento />
          </div>
        </div>
      </section>

      <section className="section section--ruled" aria-labelledby="shot-heading">
        <div className="page">
          <div className="section-head" data-reveal>
            <h2 id="shot-heading">See the real thing.</h2>
            <p>Screens from the open-source release. It plays through on its own — or click any tab.</p>
          </div>
          <ProductTour />
        </div>
      </section>

      <section className="section section--ruled" aria-labelledby="connects-heading">
        <div className="page">
          <div className="section-head" data-reveal>
            <h2 id="connects-heading">Connects to where your leads already are.</h2>
            <p>Every integration below ships in the open-source release.</p>
          </div>
          <div data-reveal>
            <IntegrationHub />
          </div>
          <p className="home-why__more">
            <Link href="/integrations" className="cta-link">
              All integrations
              <ArrowRight size={15} aria-hidden="true" />
            </Link>
          </p>
        </div>
      </section>

      <section className="section section--ruled section--raised">
        <div className="page">
          <div className="section-head" data-reveal>
            <h2>Your leads, your server, your WhatsApp account.</h2>
          </div>
          <dl className="facts" data-reveal>
            <div>
              <dt>$0</dt>
              <dd>
                <strong>per seat, per contact, per month.</strong> Add the whole team and every lead.
                Meta bills WhatsApp messages to your own account, with no markup.
              </dd>
            </div>
            <div>
              <dt>1 server</dt>
              <dd>
                <strong>Docker Compose and SQLite.</strong> A small 1–2 GB cloud server runs a team.
                Contacts, conversations and credentials stay in your database.
              </dd>
            </div>
            <div>
              <dt>{site.license}</dt>
              <dd>
                <strong>Read it, change it, keep it.</strong> Add a lead source, a channel or a
                report, and send it upstream if others need it too.
              </dd>
            </div>
          </dl>
          <p className="home-why__more">
            <Link href="/self-hosted-crm" className="cta-link">
              Why teams self-host their CRM
              <ArrowRight size={15} aria-hidden="true" />
            </Link>
          </p>
        </div>
      </section>

      <section className="section section--ruled">
        <div className="page split">
          <div className="section-head" data-reveal>
            <h2>What it deliberately doesn&rsquo;t do.</h2>
            <p>Worth knowing before you install it, not after.</p>
          </div>
          <div className="stack home-limits" data-reveal>
            <article>
              <h3>It does not bypass WhatsApp&rsquo;s rules</h3>
              <p>
                Messages go through Meta&rsquo;s official Cloud API or a Meta partner. Template approval, opt-in
                and the 24-hour window all apply. Anything that promises otherwise is asking you to lose your number.
              </p>
            </article>
            <article>
              <h3>It does not blast</h3>
              <p>Hourly and daily limits and a warm-up ramp are built in. The design assumes you want replies, not volume.</p>
            </article>
            <article>
              <h3>It does not decide for you</h3>
              <p>Price, terms and whether a lead is worth pursuing stay with the person who owns the deal. Automation handles the chasing.</p>
            </article>
          </div>
        </div>
      </section>

      <InstallBand />

      <Faq items={homeFaq} />
    </>
  )
}
