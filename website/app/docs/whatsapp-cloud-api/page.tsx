import Link from 'next/link'
import { Code } from '@/components/content'
import { DocsShell, docMetadata } from '@/components/docs-shell'

export const metadata = docMetadata('whatsapp-cloud-api')

export default function WhatsAppCloudApiDoc() {
  return (
    <DocsShell slug="whatsapp-cloud-api">
      <p>
        The WhatsApp Cloud API is Meta&rsquo;s own hosted version of the WhatsApp Business Platform.
        Connect it directly to Outbound OS using your Meta app, a system-user access token and
        your registered number&rsquo;s identifiers. Configure the incoming webhook separately so
        customer replies and delivery events reach your CRM.
      </p>

      <div className="note">
        You need a Meta business portfolio, a number eligible for your chosen Cloud API setup or
        migration route, and your Outbound OS instance on a public HTTPS address — see <Link href="/docs/install#https">Install → HTTPS</Link>.
      </div>

      <h2 id="app">1. Create a Meta app with WhatsApp</h2>
      <ol>
        <li>
          Go to <a href="https://developers.facebook.com/apps">developers.facebook.com/apps</a> and
          create an app with the WhatsApp use case, linked to the business portfolio that owns
          your messaging account.
        </li>
        <li>
          Add the <strong>WhatsApp</strong> product to the app.
        </li>
        <li>
          Under <strong>WhatsApp → API Setup</strong>, add your business phone number and verify it.
          Copy its <strong>Phone number ID</strong> and <strong>WhatsApp Business Account ID</strong>.
          The Phone number ID is not the phone number itself.
        </li>
      </ol>

      <h2 id="token">2. Generate a system-user access token</h2>
      <p>
        A temporary API Setup token is unsuitable for a lasting server connection. Create a
        dedicated system-user token and select a duration Meta makes available for your account:
      </p>
      <ol>
        <li>
          In <strong>Meta Business Settings → Users → System users</strong>, add a system user for
          this integration.
        </li>
        <li>Grant access to the app and WhatsApp account the integration needs.</li>
        <li>
          Generate a token for the app with the <code>whatsapp_business_messaging</code> and{' '}
          <code>whatsapp_business_management</code> permissions. Record its expiry and renewal
          requirements for your installation.
        </li>
      </ol>
      <p>Treat the token like a password. Outbound OS stores it encrypted.</p>

      <h2 id="connect">3. Connect the number in Outbound OS</h2>
      <ol>
        <li>
          Open <strong>Integrations → WhatsApp</strong>, add a number and choose{' '}
          <strong>Meta Cloud API</strong> as its provider.
        </li>
        <li>Enter the Phone number ID, WhatsApp Business Account ID and access token.</li>
        <li>
          Press <strong>Test connection</strong>. It reads the number&rsquo;s verified name and
          quality rating from Meta. This confirms credential access, not end-to-end delivery.
          Verify incoming and outgoing messages using a number you own before customer outreach.
        </li>
      </ol>

      <h2 id="webhook">4. Receive replies and receipts</h2>
      <p>
        Add two values to <code>.env</code> and apply them:
      </p>
      <Code label=".env">
        {
          'META_APP_SECRET=<App secret from App settings → Basic>\nMETA_WEBHOOK_VERIFY_TOKEN=<any long random string>'
        }
      </Code>
      <Code label="Terminal">{'docker compose up -d'}</Code>
      <p>
        Then, in your Meta app, open <strong>WhatsApp → Configuration → Webhook</strong>:
      </p>
      <ol>
        <li>
          Callback URL: <code>https://your-host/webhook/meta</code>
        </li>
        <li>
          Verify token: the same random string as in <code>.env</code>.
        </li>
        <li>
          Press <strong>Verify and save</strong>, then subscribe to the <strong>messages</strong>{' '}
          field.
        </li>
      </ol>
      <p>
        Every delivery is checked against <code>META_APP_SECRET</code>; one with a wrong signature
        is rejected. After verifying the subscription, send an incoming message from a number you
        own and confirm it appears in the inbox. Message states update from the delivery and read
        receipts Meta reports; provider acceptance is not proof of delivery.
      </p>

      <h2 id="template">5. Set a first-contact template</h2>
      <p>
        WhatsApp only lets a business start a conversation with a template Meta has approved. Create
        one in <strong>WhatsApp Manager → Message templates</strong>, using <code>{'{{1}}'}</code>{' '}
        for the lead&rsquo;s first name and <code>{'{{2}}'}</code> for their country:
      </p>
      <Code label="Example template body">
        {
          'Hi {{1}}, thanks for your enquiry. We ship to {{2}} — could you share the quantity you need so we can send pricing?'
        }
      </Code>
      <p>
        Once it is approved, select it as the number&rsquo;s first-contact template in
        Integrations → WhatsApp, with its language code (for example <code>en</code> or{' '}
        <code>en_US</code>). Eligible leads from enabled live sources can enter the configured
        outreach flow when the sender is ready and limits permit. Importing a list does not send it.
      </p>

      <h2 id="rules">How the 24-hour window works</h2>
      <div className="table-wrap">
        <table>
          <thead>
            <tr>
              <th scope="col">When</th>
              <th scope="col">What you can send</th>
            </tr>
          </thead>
          <tbody>
            <tr>
              <td>Within 24 hours of the customer&rsquo;s last message to that sending number</td>
              <td>A free-text reply from the inbox, subject to account and provider rules</td>
            </tr>
            <tr>
              <td>First contact, or more than 24 hours since they wrote</td>
              <td>An approved template only</td>
            </tr>
          </tbody>
        </table>
      </div>
      <p>
        Messaging charges depend on category, destination and the applicable service-window rules.
        Configure billing on your WhatsApp Business account before billable campaigns, and check{' '}
        <a href="https://developers.facebook.com/docs/whatsapp/pricing">
          Meta&rsquo;s current pricing
        </a>{' '}
        for current rates, free-message rules and payment requirements.
      </p>

      <h2 id="troubleshooting">Troubleshooting</h2>
      <h3>Test connection fails with an authentication error</h3>
      <p>
        The token has expired or lacks permissions. Generate a System User token as in step 2 — the
        temporary token from API Setup will stop working.
      </p>
      <h3>Meta will not verify the webhook</h3>
      <p>
        The verify token must match <code>META_WEBHOOK_VERIFY_TOKEN</code> exactly, the app must
        have been restarted after setting it, and the address must be reachable over HTTPS from the
        internet.
      </p>
      <h3>Messages send but replies never arrive</h3>
      <p>
        Check the webhook is subscribed to <strong>messages</strong>, and that{' '}
        <code>META_APP_SECRET</code> is the secret of the same app. The app log shows rejected
        deliveries.
      </p>
      <h3>First contact is skipped</h3>
      <p>
        Check the recorded skip reason, lead consent and state, enabled outreach settings, sender
        readiness and limits. Configure an approved first-contact template in Integrations → WhatsApp,
        or set <code>WA_FIRST_TOUCH_TEMPLATE</code> as a default. Imported, paused, opted-out or
        otherwise ineligible records should not receive automatic first contact.
      </p>
    </DocsShell>
  )
}
