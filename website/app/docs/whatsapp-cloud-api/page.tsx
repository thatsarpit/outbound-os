import Link from 'next/link'
import { Code } from '@/components/content'
import { DocsShell, docMetadata } from '@/components/docs-shell'

export const metadata = docMetadata('whatsapp-cloud-api')

export default function WhatsAppCloudApiDoc() {
  return (
    <DocsShell slug="whatsapp-cloud-api">
      <p>
        The WhatsApp Cloud API is Meta&rsquo;s own hosted version of the
        WhatsApp Business Platform. Connecting it to Outbound OS takes about
        fifteen minutes and needs no reseller: you create a Meta app, generate
        a permanent token, paste two values into Settings, and point
        Meta&rsquo;s webhook at your server so replies come back.
      </p>

      <div className="note">
        You need a Meta Business account, a phone number that is not
        registered on the WhatsApp or WhatsApp Business app (or one you are
        willing to move), and your Outbound OS instance on a public HTTPS
        address — see <Link href="/docs/install#https">Install → HTTPS</Link>.
      </div>

      <h2 id="app">1. Create a Meta app with WhatsApp</h2>
      <ol>
        <li>
          Go to <a href="https://developers.facebook.com/apps">developers.facebook.com/apps</a> and
          create an app of type <strong>Business</strong>, linked to your
          business portfolio.
        </li>
        <li>Add the <strong>WhatsApp</strong> product to the app.</li>
        <li>
          Under <strong>WhatsApp → API Setup</strong>, add your business phone
          number and verify it. Copy its <strong>Phone number ID</strong> —
          this is not the phone number itself.
        </li>
      </ol>

      <h2 id="token">2. Generate a permanent access token</h2>
      <p>
        The temporary token on the API Setup page expires within a day. For a
        server, use a System User token that does not expire:
      </p>
      <ol>
        <li>
          In <strong>Meta Business Settings → Users → System users</strong>,
          add a system user with the Admin role.
        </li>
        <li>Assign it your app and your WhatsApp account, with full control.</li>
        <li>
          Generate a token for the app with the{' '}
          <code>whatsapp_business_messaging</code> and{' '}
          <code>whatsapp_business_management</code> permissions, and set it
          never to expire.
        </li>
      </ol>
      <p>Treat the token like a password. Outbound OS stores it encrypted.</p>

      <h2 id="connect">3. Connect the number in Outbound OS</h2>
      <ol>
        <li>
          Open <strong>Settings → WhatsApp</strong>, add a number and choose{' '}
          <strong>Meta Cloud API</strong> as its provider.
        </li>
        <li>Paste the Phone number ID and the permanent token.</li>
        <li>
          Press <strong>Test connection</strong>. It reads the number&rsquo;s
          verified name and quality rating from Meta; if those appear, sending
          will work.
        </li>
      </ol>

      <h2 id="webhook">4. Receive replies and receipts</h2>
      <p>Add two values to <code>.env</code> and apply them:</p>
      <Code label=".env">{'META_APP_SECRET=<App secret from App settings → Basic>\nMETA_WEBHOOK_VERIFY_TOKEN=<any long random string>'}</Code>
      <Code label="Terminal">{'docker compose up -d'}</Code>
      <p>Then, in your Meta app, open <strong>WhatsApp → Configuration → Webhook</strong>:</p>
      <ol>
        <li>
          Callback URL: <code>https://your-host/webhook/meta</code>
        </li>
        <li>Verify token: the same random string as in <code>.env</code>.</li>
        <li>
          Press <strong>Verify and save</strong>, then subscribe to the{' '}
          <strong>messages</strong> field.
        </li>
      </ol>
      <p>
        Every delivery is checked against <code>META_APP_SECRET</code>; one
        with a wrong signature is rejected. Replies now land in the inbox, and
        sent, delivered and read receipts update on each message.
      </p>

      <h2 id="template">5. Set a first-contact template</h2>
      <p>
        WhatsApp only lets a business start a conversation with a template
        Meta has approved. Create one in <strong>WhatsApp Manager → Message
        templates</strong>, using <code>{'{{1}}'}</code> for the lead&rsquo;s
        first name and <code>{'{{2}}'}</code> for their country:
      </p>
      <Code label="Example template body">
        {'Hi {{1}}, thanks for your enquiry. We ship to {{2}} — could you share the quantity you need so we can send pricing?'}
      </Code>
      <p>
        Once it is approved, enter its name as the number&rsquo;s first-contact
        template in Settings → WhatsApp, with its language code (for example{' '}
        <code>en</code> or <code>en_US</code>). New leads now get it within
        seconds of arriving.
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
              <td>Within 24 hours of the lead&rsquo;s last message</td>
              <td>Any free-text message, from the inbox</td>
            </tr>
            <tr>
              <td>First contact, or more than 24 hours since they wrote</td>
              <td>An approved template only</td>
            </tr>
          </tbody>
        </table>
      </div>
      <p>
        Meta charges for template messages by category and the
        recipient&rsquo;s country; replies inside the window are free. Check
        Meta&rsquo;s current pricing before large campaigns.
      </p>

      <h2 id="troubleshooting">Troubleshooting</h2>
      <h3>Test connection fails with an authentication error</h3>
      <p>
        The token has expired or lacks permissions. Generate a System User
        token as in step 2 — the temporary token from API Setup will stop
        working.
      </p>
      <h3>Meta will not verify the webhook</h3>
      <p>
        The verify token must match <code>META_WEBHOOK_VERIFY_TOKEN</code>{' '}
        exactly, the app must have been restarted after setting it, and the
        address must be reachable over HTTPS from the internet.
      </p>
      <h3>Messages send but replies never arrive</h3>
      <p>
        Check the webhook is subscribed to <strong>messages</strong>, and that{' '}
        <code>META_APP_SECRET</code> is the secret of the same app. The app log
        shows rejected deliveries.
      </p>
      <h3>First contact is skipped</h3>
      <p>
        The number has no first-contact template. Set one in Settings →
        WhatsApp, or set <code>WA_FIRST_TOUCH_TEMPLATE</code> as a default for
        all numbers.
      </p>
    </DocsShell>
  )
}
