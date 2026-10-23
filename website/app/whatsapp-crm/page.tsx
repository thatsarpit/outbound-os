import Link from 'next/link'
import { ArrowRight } from 'lucide-react'
import {
  Breadcrumbs,
  Faq,
  InstallBand,
  Related,
  Screenshot,
} from '@/components/content'
import { buildMetadata } from '@/lib/metadata'
import { HeroScene } from '@/components/visuals/hero-scene'
import { site } from '@/lib/site-content'

export const metadata = buildMetadata(
  'WhatsApp CRM — open source & self-hosted',
  'An open-source WhatsApp CRM with a shared inbox, follow-ups and mobile sales workspace. Connect Meta directly. Self-host free or get expert setup.',
  '/whatsapp-crm',
)

const faq = [
  {
    q: 'What is a WhatsApp CRM?',
    a: 'A WhatsApp CRM keeps every WhatsApp conversation on the customer record it belongs to, alongside their details, status, owner and other channels — so the team works from shared history instead of one person’s phone. A good one also sends the first message and the follow-ups for you.',
  },
  {
    q: 'Is there a free, open-source WhatsApp CRM?',
    a: `Outbound OS is free and open source under the ${site.license} license. You host it yourself with Docker; there are no seat or contact fees. WhatsApp itself is not free to send on: Meta charges for template messages, billed to your own WhatsApp Business account.`,
  },
  {
    q: 'Can I use the normal WhatsApp Business app with a CRM?',
    a: 'Outbound OS connects to Meta’s official Cloud API; it does not automate the phone apps or connect by QR-code scraping. Check whether your existing number is eligible for your chosen Meta setup or needs a migration before moving it.',
  },
  {
    q: 'How much does WhatsApp messaging cost?',
    a: 'Meta messaging charges depend on message category, recipient country and applicable service-window rules. Use Meta’s current pricing page for your markets. Paid setup or hosting services are quoted separately.',
  },
  {
    q: 'Can several people share one WhatsApp number?',
    a: 'Yes. The number is connected once, and every teammate works the same inbox with their own login and role. Shared history, lead ownership and Done/Reopen help teammates coordinate. Ownership is not an exclusive conversation lock.',
  },
  {
    q: 'Can I connect more than one WhatsApp number?',
    a: 'Yes. Each number has its own Meta credentials, daily limit and first-contact template, and new leads are shared across the numbers that are ready to send.',
  },
  {
    q: 'Do I need a WhatsApp Business API provider?',
    a: 'You connect directly to Meta’s official Cloud API using your own business account and phone number. No intermediary provider subscription is required.',
  },
]

export default function WhatsAppCrmPage() {
  return (
    <>
      <section className="stage-wrap">
        <div className="stage">
          <div className="page stage__inner">
            <div className="stage__copy">
              <Breadcrumbs
                trail={[{ name: 'WhatsApp CRM', path: '/whatsapp-crm' }]}
              />
              <span className="stage__badge">
                <b>WhatsApp CRM</b>
                Official Cloud API · free and open source
              </span>
              <h1 className="stage__h1--wide">
                Your open-source WhatsApp CRM.{' '}
                <span>From first enquiry to next reply.</span>
              </h1>
              <p className="stage__lede">
                Outbound OS connects your WhatsApp Business number through
                Meta&rsquo;s official Cloud API. Keep your shared inbox,
                customer context and follow-ups together, with a focused mobile
                workspace for the replies that need you.
              </p>
              <div className="stage__actions">
                <Link href="/docs/install" className="btn btn--brand btn--lg">
                  Install free
                </Link>
                <Link
                  href="/docs/whatsapp-cloud-api"
                  className="btn btn--glass btn--lg"
                >
                  Read the Meta setup guide
                </Link>
              </div>
            </div>
            <HeroScene />
          </div>
        </div>
      </section>

      <section className="section section--tight">
        <div className="page landing-shot">
          <Screenshot
            name="inbox"
            alt="Outbound OS shared inbox showing WhatsApp, email, Telegram and iMessage conversations on each lead"
            caption="The shared inbox: every channel on the lead it belongs to. Sample data."
          />
        </div>
      </section>

      <section className="section section--ruled">
        <div className="page split">
          <div className="section-head">
            <p className="eyebrow">What it does</p>
            <h2>
              Everything between &ldquo;new enquiry&rdquo; and &ldquo;they
              replied&rdquo;.
            </h2>
            <p>
              Handle incoming enquiries, configure follow-up sequences and keep
              the next action on the customer record. Start with the parts your
              team needs.
            </p>
          </div>
          <div className="points">
            <div>
              <h3>Instant first contact</h3>
              <p>
                Configured live sources can queue an approved first-contact
                template, using the lead’s name and country. Limits, eligibility
                and account settings still apply.
              </p>
            </div>
            <div>
              <h3>Follow-ups that stop on reply</h3>
              <p>
                Sequences are timed for the lead&rsquo;s morning in their own
                country and end the moment they reply, opt out or close.
              </p>
            </div>
            <div>
              <h3>A shared inbox with owners</h3>
              <p>
                Everyone works the same number from their own login. Each lead
                has one owner, a status, notes and tasks.
              </p>
            </div>
            <div>
              <h3>Campaigns that respect the rules</h3>
              <p>
                Send to any slice of your leads by tag, status, country or
                score, using approved templates for anyone outside the 24-hour
                window.
              </p>
            </div>
            <div>
              <h3>Photos, PDFs and voice notes</h3>
              <p>
                Buyers&rsquo; drawings, purchase orders and voice notes are
                saved on your server and open in the inbox. Send your price list
                or catalogue back from the same place.
              </p>
            </div>
            <div>
              <h3>Read receipts and reply rates</h3>
              <p>
                See provider acceptance separately from delivery and read
                receipts. Failed and uncertain manual attempts remain visible,
                with the reason when available.
              </p>
            </div>
            <div>
              <h3>Email, Telegram and iMessage too</h3>
              <p>
                When a buyer prefers another channel, the conversation stays on
                the same lead.
              </p>
            </div>
          </div>
        </div>
      </section>

      <section className="section section--ruled section--raised">
        <div className="page">
          <div className="section-head">
            <p className="eyebrow">WhatsApp&rsquo;s rules</p>
            <h2>
              Built around how the WhatsApp Business Platform actually works.
            </h2>
            <p>
              A WhatsApp CRM that ignores these rules gets numbers restricted.
              Outbound OS is designed around them.
            </p>
          </div>
          <div className="comparison-wrap">
            <table className="comparison comparison--compact">
              <thead>
                <tr>
                  <th scope="col">Situation</th>
                  <th scope="col">What WhatsApp allows</th>
                  <th scope="col">What Outbound OS does</th>
                </tr>
              </thead>
              <tbody>
                <tr>
                  <th scope="row">First message to a new lead</th>
                  <td>Only an approved template</td>
                  <td>
                    <strong>Uses your approved template</strong> when first
                    contact is configured
                  </td>
                </tr>
                <tr>
                  <th scope="row">Lead replied in the last 24 hours</th>
                  <td>Free-text messages, no template needed</td>
                  <td>
                    <strong>Lets your team reply freely</strong> from the inbox
                  </td>
                </tr>
                <tr>
                  <th scope="row">
                    More than 24 hours since their last message
                  </th>
                  <td>Templates only</td>
                  <td>
                    <strong>Uses a template</strong> for follow-ups and
                    campaigns
                  </td>
                </tr>
                <tr>
                  <th scope="row">Lead says stop</th>
                  <td>You must stop messaging them</td>
                  <td>
                    <strong>Cancels everything queued</strong> and pauses the
                    lead
                  </td>
                </tr>
                <tr>
                  <th scope="row">New number</th>
                  <td>Low limits that grow with quality</td>
                  <td>
                    <strong>Hourly and daily caps</strong> per number, plus a
                    warm-up ramp
                  </td>
                </tr>
              </tbody>
            </table>
          </div>
        </div>
      </section>

      <section className="section section--ruled">
        <div className="page split split--reverse">
          <Screenshot
            name="whatsapp-settings"
            alt="WhatsApp settings in Outbound OS: connect directly to Meta Cloud API for each number"
          />
          <div className="section-head">
            <p className="eyebrow">Your own business account</p>
            <h2>Connect directly to Meta.</h2>
            <p>
              Configure your phone number ID, access token and signed webhook,
              then verify the connection. Your number and approved templates
              stay in your own Meta business account. Meta account requirements
              and messaging charges still apply.
            </p>
            <Link href="/integrations/whatsapp-cloud-api" className="cta-link">
              WhatsApp Cloud API integration
              <ArrowRight size={15} aria-hidden="true" />
            </Link>
          </div>
        </div>
      </section>

      <section className="section section--ruled">
        <div className="page split">
          <div className="section-head">
            <p className="eyebrow">Cost</p>
            <h2>What a free WhatsApp CRM actually costs.</h2>
          </div>
          <div className="points">
            <div>
              <h3>The software: nothing</h3>
              <p>
                Free under {site.license}, for any number of users, leads and
                numbers. No paid tier hides features.
              </p>
            </div>
            <div>
              <h3>WhatsApp messages: Meta&rsquo;s rates</h3>
              <p>
                Meta bills messages to your own WhatsApp Business account, by
                category and the recipient&rsquo;s country and applicable
                service-window rules. Check Meta&rsquo;s current rate card
                before budgeting.
              </p>
            </div>
            <div>
              <h3>A small server</h3>
              <p>
                Use a persistent server with Docker. Start around 2 GB of memory
                for a small deployment and monitor usage, backups and available
                disk space.
              </p>
            </div>
          </div>
        </div>
      </section>

      <section className="section section--ruled os-ownership">
        <div className="page os-section-heading">
          <div>
            <p className="eyebrow">A sales day, beyond your desk</p>
            <h2>Your customer inbox, on your phone.</h2>
          </div>
          <p>
            Add Outbound OS to your Home Screen. Open conversations, work
            through tasks and check customer context without navigating the full
            desktop dashboard. Device notifications need a supported browser and
            permission on that device.
          </p>
        </div>
        <div className="page os-actions">
          <a href={site.demoUrl} className="btn btn--primary">
            Try the sample workspace <ArrowRight size={15} />
          </a>
          <Link href="/managed-hosting" className="cta-link">
            Get help with your setup <ArrowRight size={15} />
          </Link>
        </div>
      </section>

      <Faq items={faq} heading="WhatsApp CRM questions" />

      <Related
        links={[
          {
            href: '/docs/whatsapp-cloud-api',
            title: 'Connect the WhatsApp Cloud API',
            body: 'Meta app, permanent token, webhook and first template, step by step.',
          },
          {
            href: '/alternatives/wati',
            title: 'Outbound OS vs Wati',
            body: 'A hosted WhatsApp platform compared with one you run yourself.',
          },
          {
            href: '/integrations/webhooks',
            title: 'Connect your lead sources',
            body: 'Source-key intake, reviewed historical imports and outgoing webhooks.',
          },
        ]}
      />

      <InstallBand />
    </>
  )
}
