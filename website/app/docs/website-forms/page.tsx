import Link from 'next/link'
import { Code } from '@/components/content'
import { DocsShell, docMetadata } from '@/components/docs-shell'

export const metadata = docMetadata('website-forms')

const fields: [string, string][] = [
  ['name', 'name, full_name, contact_name, buyerName, sender_name'],
  ['mobile', 'mobile, phone, phone_number, whatsapp, contact_mobile'],
  ['email', 'email, email_address, contact_email'],
  ['company', 'company, company_name, org_name'],
  ['product', 'product, subject, enquiry, requirement, message'],
  ['country', 'country'],
  ['consent', 'email_consent, marketing_consent, newsletter, subscribe, opt_in'],
]

export default function WebsiteFormsDoc() {
  return (
    <DocsShell slug="website-forms">
      <p>
        Every way a lead gets into Outbound OS — a website form, Zapier, a
        marketplace, your own code — is a <strong>lead source</strong>: a web
        address with its own key and field map. A lead that arrives through
        one is deduplicated and contacted on your connected channels within
        seconds.
      </p>

      <h2 id="create">1. Create a source</h2>
      <p>
        Open <strong>Integrations → Webhooks</strong>. Use{' '}
        <strong>Quick add from presets</strong> for a known sender (website
        form, Facebook Lead Ads, IndiaMART, TradeIndia, JustDial, Engyne
        Cloud), or <strong>Add webhook source</strong> for anything else. You
        get an address and a key:
      </p>
      <Code label="Address">{'https://your-host/api/webhooks/inbound/<source>'}</Code>
      <p>
        The key is shown in full only once. Send it in an{' '}
        <code>x-api-key</code> header, or — for senders that cannot set headers,
        such as a plain HTML form or IndiaMART — as <code>?apiKey=&lt;key&gt;</code>{' '}
        on the address.
      </p>

      <h2 id="html">2a. From an HTML form</h2>
      <Code label="contact.html">
        {`<form action="https://your-host/api/webhooks/inbound/<source>?apiKey=<key>" method="post">
  <input name="name" required>
  <input name="email" type="email">
  <input name="phone">
  <textarea name="message"></textarea>
  <label><input type="checkbox" name="email_consent" value="yes"> Email me updates</label>
  <input type="text" name="_gotcha" style="display:none" tabindex="-1" autocomplete="off">
  <input type="hidden" name="_next" value="https://your-site.com/thanks">
  <button>Send</button>
</form>`}
      </Code>
      <ul>
        <li>
          <code>_gotcha</code> is a spam trap. People never see it; a
          submission that fills it is answered as a success and dropped.
        </li>
        <li>
          <code>_next</code> sends the visitor to your own thank-you page. It
          is only followed back to the site the form was posted from.
          Without it, visitors see a short thank-you page.
        </li>
        <li>
          A ticked <code>email_consent</code> records marketing consent with
          its time and source. An unticked box is not consent.
        </li>
      </ul>

      <h2 id="json">2b. From Zapier, Make, n8n or code</h2>
      <Code label="Terminal">
        {`curl -X POST https://your-host/api/webhooks/inbound/<source> \\
  -H "Content-Type: application/json" \\
  -H "x-api-key: <key>" \\
  -d '{"name":"Jane Doe","phone":"+44 7700 900123","email":"jane@example.com","product":"500 units"}'`}
      </Code>
      <p>The response says what happened:</p>
      <Code label="Response">{`{ "ok": true, "leadId": 1042, "created": true, "outreach": { … } }`}</Code>
      <p>
        <code>created</code> is <code>false</code> when the submission merged
        into an existing lead. A lead needs at least a phone number or an
        email; without either the response is <code>400</code>.
      </p>

      <h2 id="fields">Field names that are recognised</h2>
      <p>
        You rarely need a field map. These names are recognised without one
        (names are case-sensitive):
      </p>
      <div className="table-wrap">
        <table>
          <thead>
            <tr>
              <th scope="col">Lead field</th>
              <th scope="col">Accepted names (examples)</th>
            </tr>
          </thead>
          <tbody>
            {fields.map(([field, names]) => (
              <tr key={field}>
                <td>
                  <code>{field}</code>
                </td>
                <td>{names}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      <p>
        For anything else, edit the source&rsquo;s field map. Paths can reach
        into nested JSON with dots — <code>data.lead.buyerMobile</code> or{' '}
        <code>RESPONSE.SENDER_NAME</code>.
      </p>

      <h2 id="test">Test without sending anything</h2>
      <p>
        Add <code>&quot;test&quot;: true</code> to a JSON body. The response shows
        the lead that <em>would</em> be created, with every mapped field, and
        nothing is stored or sent.
      </p>
      <Code label="Terminal">
        {`curl -X POST https://your-host/api/webhooks/inbound/<source> \\
  -H "Content-Type: application/json" -H "x-api-key: <key>" \\
  -d '{"test": true, "name": "Test Lead", "email": "test@example.com"}'`}
      </Code>

      <h2 id="duplicates">Duplicates</h2>
      <p>
        A submission with a phone number or email that already belongs to a
        lead updates that lead instead of creating another, filling in fields
        that were empty. It is not contacted a second time.
      </p>

      <h2 id="sources">Source-specific guides</h2>
      <ul>
        <li>
          <Link href="/integrations/indiamart">IndiaMART</Link> — the Lead
          Manager Push API
        </li>
        <li>
          <Link href="/integrations/facebook-lead-ads">Facebook Lead Ads</Link> — through
          Zapier, Make or n8n
        </li>
        <li>
          <Link href="/integrations/engyne-cloud">Engyne Cloud</Link> — lead.captured events
        </li>
        <li>
          <Link href="/form-backend">Using Outbound OS as a form backend</Link>
        </li>
      </ul>
    </DocsShell>
  )
}
