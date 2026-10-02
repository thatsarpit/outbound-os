import Link from 'next/link'
import { Code } from '@/components/content'
import { DocsShell, docMetadata } from '@/components/docs-shell'
import { googleFormsScript } from '@/lib/setup-examples'

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
        Cloud, Typeform, Tally, Google Forms), or <strong>Add webhook source</strong> for anything else. You
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

      <h2 id="webflow">Webflow: custom form action</h2>
      <ol>
        <li>Create a <strong>Website Contact Form</strong> source in Outbound OS and copy its URL and key.</li>
        <li>In Webflow Designer, select the form and open its settings. Under <strong>Send to</strong>, remove Webflow and Email notifications, then add <strong>Custom action</strong>. Set the URL to the webhook URL with <code>?apiKey=&lt;key&gt;</code>, choose <strong>POST</strong>, and save.</li>
        <li>Set the input field names to <code>name</code>, <code>email</code>, <code>phone</code> and <code>message</code>. The field name, not its visible label, is what the server receives. Require an email or phone number.</li>
        <li>Publish the site and submit from the published page. Custom actions bypass Webflow&rsquo;s built-in submission storage and notification flow; Outbound OS returns its thank-you page.</li>
        <li>Check the new lead&rsquo;s contact details and source in Outbound OS. An identical second submission should update the same lead.</li>
      </ol>
      <p>
        For your own thank-you page, add a hidden <code>_next</code> input inside the form
        through an HTML Embed. Its URL must belong to the same host as the submitted page.
        A plain form cannot set an <code>x-api-key</code> header; use the query parameter here.
      </p>

      <h2 id="wordpress">WordPress: Contact Form 7 and CF7 to Webhook</h2>
      <p>
        This free route uses <a href="https://wordpress.org/plugins/contact-form-7/">Contact Form 7</a>
        {' '}and <a href="https://wordpress.org/plugins/cf7-to-zapier/">CF7 to Webhook</a>.
        The add-on sends JSON from WordPress to your public HTTPS webhook endpoint.
      </p>
      <ol>
        <li>Create a <strong>Website Contact Form</strong> source in Outbound OS and copy its URL and key.</li>
        <li>In WordPress, open <strong>Plugins → Add Plugin</strong>, then install and activate Contact Form 7 and CF7 to Webhook.</li>
        <li>Open <strong>Contact → Contact Forms</strong> and edit or create a form. In its <strong>Form</strong> tab, use the tags below. The <code>webhook:</code> option maps your CF7 field names to the names Outbound OS expects.</li>
        <li>Open the form&rsquo;s <strong>Webhook</strong> tab. Check <strong>Send to Webhook</strong> and paste the source URL into <strong>Webhook URL</strong>. Under <strong>Method</strong>, keep POST.</li>
        <li>Expand <strong>Headers</strong> and enter <code>x-api-key: &lt;your-source-key&gt;</code>, with a colon separating the name and value. Leave the custom <strong>Body</strong> empty to send the mapped fields as JSON.</li>
        <li>Choose whether <strong>Send Mail</strong> should also send CF7&rsquo;s normal email notification. Leave it unchecked for a webhook-only form, then save.</li>
        <li>Copy the generated shortcode into a page and publish it. Submit, check the lead&rsquo;s contact details and message in Outbound OS, and submit again to confirm the same lead is updated.</li>
      </ol>
      <Code label="Contact Form 7 → Form">{`<label>Name [text* your-name webhook:name]</label>
<label>Email [email* your-email webhook:email]</label>
<label>Phone [tel your-phone webhook:phone]</label>
<label>Message [textarea your-message webhook:message]</label>
[submit "Send enquiry"]`}</Code>
      <p>
        Email is required in this example; phone is optional. The add-on blocks private and
        loopback destinations by default, so use your public HTTPS URL. For a controlled
        private deployment, follow the add-on&rsquo;s explicit host allowlist instructions;
        keep its default protection for other destinations.
      </p>

      <h2 id="wordpress-wpforms">WordPress alternative: WPForms webhook addon</h2>
      <p>
        This route needs WPForms&rsquo; <a href="https://wpforms.com/docs/how-to-install-and-use-the-webhooks-addon-with-wpforms/">Webhooks addon</a>,
        currently included in its Elite license.
      </p>
      <ol>
        <li>Create a <strong>Website Contact Form</strong> source in Outbound OS.</li>
        <li>Activate the Webhooks addon in WPForms. Edit the form, open <strong>Settings → Webhooks</strong> and enable webhooks.</li>
        <li>Set <strong>Request URL</strong> to the copied source URL, <strong>Request Method</strong> to POST and <strong>Request Format</strong> to JSON.</li>
        <li>Add a request header named <code>x-api-key</code> with the copied source key.</li>
        <li>In <strong>Request Body</strong>, add keys <code>name</code>, <code>email</code>, <code>phone</code> and <code>message</code>. Map each value to its form field using WPForms&rsquo; field picker. Require email or phone.</li>
        <li>Save the form, embed it in a published page and submit. Check the lead and its source in Outbound OS, then repeat the submission to confirm deduplication.</li>
      </ol>
      <p>WPForms handles its own visitor confirmation. Never put the webhook key in a visible form input.</p>

      <h2 id="tally">Tally: submission webhook</h2>
      <ol>
        <li>Create a <strong>Tally</strong> source from Outbound OS&rsquo;s presets.</li>
        <li>Use question labels <code>Name</code>, <code>Email</code>, <code>Phone</code> and <code>Message</code>; Company and Country are optional. Require at least Email or Phone.</li>
        <li>Publish the form. In Tally, open <strong>Integrations → Webhooks</strong> and add the copied source URL.</li>
        <li>Add an HTTP header named <code>x-api-key</code> with the source key, then connect the webhook. Webhooks are currently available on Tally&rsquo;s free plan.</li>
        <li>Submit the published form. Check Tally&rsquo;s webhook delivery and the new lead in Outbound OS. Replay or repeat the submission and verify that no second lead appears.</li>
      </ol>
      <p>
        Tally sends <code>data.fields</code> as an array. The preset resolves labels without
        depending on question order. For renamed questions, map stable keys such as
        <code> data.fields.question_abc.value</code>. A checkbox&rsquo;s option IDs are not consent;
        map <code>email_consent</code> only to a field that delivers an explicit yes/true value.
        See <a href="https://tally.so/help/webhooks">Tally&rsquo;s webhook guide</a>.
      </p>
      <Code label="Sanitized Tally payload shape">{`{
  "eventType": "FORM_RESPONSE",
  "data": { "fields": [
    { "key": "question_name", "label": "Name", "type": "INPUT_TEXT", "value": "Test Buyer" },
    { "key": "question_email", "label": "Email", "type": "INPUT_EMAIL", "value": "buyer@example.test" },
    { "key": "question_message", "label": "Message", "type": "TEXTAREA", "value": "Need 500 units" }
  ] }
}`}</Code>

      <h2 id="typeform">Typeform: response webhook</h2>
      <ol>
        <li>Create a <strong>Typeform</strong> source from the presets.</li>
        <li>Use Name, Company and Message as question titles; use the Email and Phone Number question types for contact details. Require at least one contact field.</li>
        <li>In Typeform&rsquo;s form connection settings, add a webhook with the source URL and <code>?apiKey=&lt;key&gt;</code>. Typeform does not support a custom <code>x-api-key</code> delivery header.</li>
        <li>Enable the webhook and submit a published form response. Check the mapped lead in Outbound OS and repeat the delivery to confirm deduplication.</li>
      </ol>
      <p>
        Answers are matched by stable field ref or by question title from
        <code> form_response.definition.fields</code>. Email and Phone Number can also be matched
        by their question type. Change the preset&rsquo;s paths if your titles differ. A named
        ref works as <code>form_response.answers.name.text</code>; avoid numeric answer indexes,
        which change when questions are reordered. See the
        <a href="https://www.typeform.com/developers/webhooks/example-payload/"> Typeform payload reference</a>.
      </p>

      <h2 id="google-forms">Google Forms: Apps Script submit trigger</h2>
      <ol>
        <li>Create a <strong>Google Forms</strong> source from the presets.</li>
        <li>Create questions titled Name, Email, Phone and Message, with optional Company and Country. Require Email or Phone. For optional email marketing consent, use a Yes/No question titled <code>Email_consent</code>.</li>
        <li>From the form&rsquo;s menu, open <strong>Script editor</strong> and paste the script below. This must be attached to the form, not its response spreadsheet.</li>
        <li>Open <strong>Project Settings → Script properties</strong>. Set <code>OUTBOUNDOS_WEBHOOK_URL</code> to the source URL and <code>OUTBOUNDOS_API_KEY</code> to its key.</li>
        <li>In <strong>Triggers</strong>, add a trigger for <code>onFormSubmit</code>, event source <strong>From form</strong>, event type <strong>On form submit</strong>. Authorize the script when Google prompts.</li>
        <li>Submit through the published form. Check Apps Script&rsquo;s <strong>Executions</strong> for failures and Outbound OS for the lead. Do not press Run in the editor: it has no form-submit event.</li>
      </ol>
      <Code label="Code.gs">{googleFormsScript}</Code>
      <p>
        Google Forms does not have a native direct-webhook switch. Keep the key in Script
        properties, not a form question. The script reports non-success HTTP responses;
        check trigger failure notifications because it does not implement automatic retries.
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
