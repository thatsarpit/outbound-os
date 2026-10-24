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
import { MobileShowcase } from '@/components/mobile-showcase'
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
      <section className="section section--lead crm-hero">
        <div className="page">
          <Breadcrumbs trail={[{ name: 'WhatsApp CRM', path: '/whatsapp-crm' }]} />
          <div className="crm-hero__intro">
            <div>
              <p className="eyebrow">WhatsApp CRM · official Cloud API</p>
              <h1>Your WhatsApp CRM. The whole customer story.</h1>
            </div>
            <div className="crm-hero__copy">
              <p className="lede">Connect your WhatsApp Business number directly to Meta.
                Work from a shared inbox with customer context, follow-ups and a
                focused mobile workspace for the conversations that need you.</p>
              <div className="hero__actions">
                <a href={site.demoUrl} className="btn btn--primary btn--lg">Explore the inbox<ArrowRight size={15} aria-hidden="true" /></a>
                <Link href="/docs/whatsapp-cloud-api" className="cta-link">Read the Meta setup guide<ArrowRight size={14} aria-hidden="true" /></Link>
              </div>
            </div>
          </div>
          <div className="crm-hero__product">
            <div className="crm-hero__product-label"><span>Outbound OS / Shared inbox</span><span>One customer record. Every connected channel.</span></div>
            <Screenshot name="inbox" priority alt="Outbound OS dark shared inbox with customer conversations, channel selection and a reply composer" caption="The Outbound OS inbox, with sample records." />
          </div>
          <div className="crm-hero__facts" aria-label="WhatsApp connection essentials">
            <p><strong>Your number.</strong> Your Meta business account.</p>
            <p><strong>Shared history.</strong> Separate teammate logins.</p>
            <p><strong>Open source.</strong> Self-host without a seat fee.</p>
          </div>
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
              <h3>First contact, with your rules</h3>
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
                country and stop when they reply, opt out or close.
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
        <div className="page"><MobileShowcase /></div>
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
