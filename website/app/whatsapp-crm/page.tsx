import Link from 'next/link'
import { ArrowRight } from 'lucide-react'
import { Breadcrumbs, Faq, InstallBand, Related, Screenshot } from '@/components/content'
import { buildMetadata } from '@/lib/metadata'
import { site } from '@/lib/site-content'

export const metadata = buildMetadata(
  'Open-source WhatsApp CRM — free and self-hosted',
  "A free, open-source WhatsApp CRM on Meta's official Cloud API: instant first contact, follow-ups that stop on reply, a shared inbox and a pipeline. Self-hosted.",
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
    a: 'Not safely. Tools that automate the WhatsApp or WhatsApp Business phone app break WhatsApp’s terms, and the number can be banned. Outbound OS uses Meta’s official WhatsApp Business Platform (the Cloud API), which is built for software to send through.',
  },
  {
    q: 'How much does WhatsApp messaging cost?',
    a: 'Meta charges per template message, by category (marketing, utility, authentication) and by the recipient’s country. Replies inside the 24-hour customer-service window are free. Rates change, so check Meta’s current pricing page for your markets.',
  },
  {
    q: 'Can several people share one WhatsApp number?',
    a: 'Yes. The number is connected once, and every teammate works the same inbox with their own login and role. Each lead has an owner, so two people never answer the same customer.',
  },
  {
    q: 'Can I connect more than one WhatsApp number?',
    a: 'Yes. Each number has its own provider, daily limit and first-contact template, and new leads are shared across the numbers that are ready to send.',
  },
  {
    q: 'Does it work with WhatsApp Business API providers like AiSensy?',
    a: 'AiSensy is supported directly, per number. For other providers, connecting your number to Meta’s Cloud API directly is usually the simplest path.',
  },
]

export default function WhatsAppCrmPage() {
  return (
    <>
      <section className="section section--lead">
        <div className="page landing-hero">
          <Breadcrumbs trail={[{ name: 'WhatsApp CRM', path: '/whatsapp-crm' }]} />
          <p className="eyebrow">WhatsApp CRM</p>
          <h1>The open-source WhatsApp CRM that does the chasing.</h1>
          <p className="lede">
            Outbound OS connects your WhatsApp Business number through
            Meta&rsquo;s official Cloud API, messages every new lead within
            seconds, and follows up until they reply — with the whole thread
            on a shared lead record your team can work together. Free, and
            it runs on your own server.
          </p>
          <div className="hero__actions">
            <Link href="/docs/install" className="btn btn--primary btn--lg">
              Install free
            </Link>
            <Link href="/docs/whatsapp-cloud-api" className="cta-link">
              Connect WhatsApp in 15 minutes
              <ArrowRight size={15} aria-hidden="true" />
            </Link>
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
            <h2>Everything between &ldquo;new enquiry&rdquo; and &ldquo;they replied&rdquo;.</h2>
            <p>
              Most WhatsApp tools are inboxes. Outbound OS also owns the part
              people forget: the second, third and fourth message.
            </p>
          </div>
          <div className="points">
            <div>
              <h3>Instant first contact</h3>
              <p>
                A lead from your website, an ad or a marketplace gets your
                approved template within seconds, filled with their first name
                and country.
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
              <h3>Read receipts and reply rates</h3>
              <p>
                Sent, delivered and read on every message, and reply rates per
                campaign and per number.
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
            <h2>Built around how the WhatsApp Business Platform actually works.</h2>
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
                  <td><strong>Sends your first-contact template</strong> automatically</td>
                </tr>
                <tr>
                  <th scope="row">Lead replied in the last 24 hours</th>
                  <td>Free-text messages, no template needed</td>
                  <td><strong>Lets your team reply freely</strong> from the inbox</td>
                </tr>
                <tr>
                  <th scope="row">More than 24 hours since their last message</th>
                  <td>Templates only</td>
                  <td><strong>Uses a template</strong> for follow-ups and campaigns</td>
                </tr>
                <tr>
                  <th scope="row">Lead says stop</th>
                  <td>You must stop messaging them</td>
                  <td><strong>Cancels everything queued</strong> and pauses the lead</td>
                </tr>
                <tr>
                  <th scope="row">New number</th>
                  <td>Low limits that grow with quality</td>
                  <td><strong>Hourly and daily caps</strong> per number, plus a warm-up ramp</td>
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
            alt="WhatsApp settings in Outbound OS: choose Meta Cloud API or AiSensy for each number"
          />
          <div className="section-head">
            <p className="eyebrow">Your provider, your choice</p>
            <h2>Connect Meta directly, or keep AiSensy.</h2>
            <p>
              Paste a phone number ID and a permanent token from Meta and the
              number is live, with nobody in between. Already on AiSensy? Choose
              it for that number instead. Different numbers can use different
              providers.
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
                Meta bills template messages to your WhatsApp Business account,
                by category and the recipient&rsquo;s country. Replies within
                the 24-hour window are free.
              </p>
            </div>
            <div>
              <h3>A small server</h3>
              <p>
                Any machine with Docker. A cloud server with 1–2 GB of memory
                runs a team comfortably.
              </p>
            </div>
          </div>
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
            href: '/integrations/indiamart',
            title: 'IndiaMART to WhatsApp',
            body: 'Reply to every marketplace enquiry within seconds.',
          },
        ]}
      />

      <InstallBand />
    </>
  )
}
