import Link from 'next/link'
import { ArrowRight } from 'lucide-react'
import { Breadcrumbs, Code, Faq, InstallBand, Related } from '@/components/content'
import { buildMetadata } from '@/lib/metadata'

export const metadata = buildMetadata(
  'Open-source form backend that replies on WhatsApp',
  'Point any HTML form at Outbound OS: spam trap, redirect, consent capture and JSON — and every submission becomes a lead that gets a WhatsApp and email reply in seconds.',
  '/form-backend',
)

const snippet = `<form action="https://your-host/api/webhooks/inbound/<source>?apiKey=<key>" method="post">
  <input name="name" required>
  <input name="email" type="email">
  <input name="phone">
  <textarea name="message"></textarea>
  <label><input type="checkbox" name="email_consent" value="yes"> Email me updates</label>
  <input type="text" name="_gotcha" style="display:none" tabindex="-1" autocomplete="off">
  <input type="hidden" name="_next" value="https://your-site.com/thanks">
  <button>Send</button>
</form>`

const faq = [
  {
    q: 'What is a form backend?',
    a: 'A service that receives a website form’s submissions so you do not have to write server code. Outbound OS is one you host yourself — and instead of only emailing you the submission, it turns it into a lead and contacts that person.',
  },
  {
    q: 'Is it a Formspree alternative?',
    a: 'For lead forms, yes: the same form conventions (_gotcha, _next) work, on your own server, with no monthly submission cap. Formspree is a hosted service focused on delivering submissions; Outbound OS is a CRM that acts on them. For a plain contact form that should only email you, Formspree is simpler.',
  },
  {
    q: 'Does it work with Webflow, WordPress or Framer?',
    a: 'Yes, with any builder that can post a form to a custom URL or call a webhook. Use the form’s action setting, or the builder’s webhook integration with the key in an x-api-key header.',
  },
  {
    q: 'How is spam handled?',
    a: 'Add the hidden _gotcha field. People never see it; bots fill every field, so a submission with _gotcha filled is answered as a success and silently discarded.',
  },
  {
    q: 'Is the API key safe in public HTML?',
    a: 'The key only allows creating leads for that one source, and a redirect is only followed back to the site that posted the form. Keys are per source, so you can rotate one without touching the others.',
  },
  {
    q: 'What happens if someone submits twice?',
    a: 'The second submission merges into the existing lead by phone or email, filling any fields that were missing, instead of creating a duplicate or messaging them again.',
  },
]

export default function FormBackendPage() {
  return (
    <>
      <section className="section section--lead">
        <div className="page landing-hero">
          <Breadcrumbs trail={[{ name: 'Form backend', path: '/form-backend' }]} />
          <p className="eyebrow">Form backend</p>
          <h1>A form backend that answers the lead for you.</h1>
          <p className="lede">
            Point any HTML form at Outbound OS. Each submission becomes a lead,
            deduplicated, and gets a WhatsApp message and an email within
            seconds — then follow-ups until they reply. Open source, on your
            own server, with no monthly submission cap.
          </p>
          <div className="hero__actions">
            <Link href="/docs/website-forms" className="btn btn--primary btn--lg">
              Set up a form
            </Link>
            <Link href="/docs/install" className="cta-link">
              Install first
              <ArrowRight size={15} aria-hidden="true" />
            </Link>
          </div>
        </div>
      </section>

      <section className="section section--ruled">
        <div className="page split">
          <div className="section-head">
            <p className="eyebrow">The whole setup</p>
            <h2>One form tag. No server code.</h2>
            <p>
              The setup wizard gives you this form with your address and key
              filled in. Keep the fields you need; the names are recognised
              automatically.
            </p>
          </div>
          <Code label="contact.html">{snippet}</Code>
        </div>
      </section>

      <section className="section section--ruled section--raised">
        <div className="page split">
          <div className="section-head">
            <p className="eyebrow">Form conventions</p>
            <h2>The conventions you already know.</h2>
          </div>
          <div className="points">
            <div>
              <h3>_gotcha — spam trap</h3>
              <p>A hidden field only bots fill. Those submissions get a success response and are dropped.</p>
            </div>
            <div>
              <h3>_next — your own thank-you page</h3>
              <p>
                Sends the visitor back to a page on your site. Only followed to
                the site the form was posted from, so it can never be used as
                an open redirect. Without it, visitors see a short thank-you
                page.
              </p>
            </div>
            <div>
              <h3>email_consent — marketing permission</h3>
              <p>
                A ticked box records consent with the time and source. Also
                accepted: marketing_consent, newsletter, subscribe. Unticked
                means no consent.
              </p>
            </div>
            <div>
              <h3>JSON too</h3>
              <p>
                Zapier, Make, n8n or your own code post JSON to the same
                address, with the key in an x-api-key header.
              </p>
            </div>
          </div>
        </div>
      </section>

      <section className="section section--ruled">
        <div className="page">
          <div className="section-head">
            <p className="eyebrow">After submit</p>
            <h2>What happens in the next few seconds.</h2>
          </div>
          <ol className="steps">
            {[
              ['The lead is created or merged', 'Matched by phone or email, so a repeat visitor updates their existing record.'],
              ['First contact goes out', 'Your approved WhatsApp template and an email, on every channel you have connected.'],
              ['Your other tools hear about it', 'A row in Google Sheets and a signed webhook to anything else you subscribe.'],
              ['Follow-ups are scheduled', 'Timed for the lead’s morning, and cancelled the moment they reply.'],
            ].map(([title, body], index) => (
              <li key={title}>
                <span className="steps__n tabular">{String(index + 1).padStart(2, '0')}</span>
                <div>
                  <h3>{title}</h3>
                  <p>{body}</p>
                </div>
              </li>
            ))}
          </ol>
        </div>
      </section>

      <Faq items={faq} heading="Form backend questions" />

      <Related
        links={[
          { href: '/docs/website-forms', title: 'Website forms guide', body: 'Field names, JSON posts, testing and field maps.' },
          { href: '/integrations/facebook-lead-ads', title: 'Facebook Lead Ads', body: 'Instant-form leads contacted in seconds.' },
          { href: '/integrations/google-sheets', title: 'Google Sheets', body: 'A live row for every new lead and reply.' },
        ]}
      />

      <InstallBand />
    </>
  )
}
