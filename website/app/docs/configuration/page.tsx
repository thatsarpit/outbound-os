import Link from 'next/link'
import { DocsShell, docMetadata } from '@/components/docs-shell'
import { site } from '@/lib/site-content'

export const metadata = docMetadata('configuration')

type Row = [name: string, def: string, what: string]

const groups: { id: string; heading: string; intro?: string; rows: Row[] }[] = [
  {
    id: 'sign-in',
    heading: 'Sign-in',
    rows: [
      ['ADMIN_EMAIL', '—', 'The first admin, created on first boot. Set this before starting.'],
      ['ADMIN_PASSWORD', 'generated', 'Their password. Left empty, a random one is printed once in the log.'],
      ['AUTH_PROVIDER', 'local', 'local for built-in email and password; clerk for Clerk-hosted sign-in.'],
      ['CLERK_SECRET_KEY, CLERK_PUBLISHABLE_KEY', '—', 'Only with AUTH_PROVIDER=clerk.'],
      ['JWT_SECRET', 'generated', 'Signs sessions. Generated into instance-secrets.json if empty.'],
    ],
  },
  {
    id: 'business',
    heading: 'Your business',
    intro: 'Also editable in the setup wizard and Settings → Workspace; values saved there win over .env.',
    rows: [
      ['BUSINESS_NAME, BUSINESS_WEBSITE', '—', 'Your identity in outgoing messages and emails.'],
      ['BUSINESS_TIMEZONE', 'UTC', 'An IANA name such as Europe/London. When “today” starts for limits and reports.'],
      ['DEFAULT_COUNTRY_CODE', '—', 'Calling code added to numbers entered without one: 1, 44, 91…'],
      ['BUSINESS_CURRENCY', 'USD', 'Currency for supplier costs, profit and reports.'],
      ['EMAIL_SIGNATURE_NAME, EMAIL_FOOTER_NOTE', '—', 'Signature and footer in outreach emails.'],
    ],
  },
  {
    id: 'server',
    heading: 'Server',
    rows: [
      ['OUTBOUNDOS_PORT', '3001', 'Port published on the host by Docker Compose.'],
      ['TRUST_PROXY', 'local proxies', 'How many proxy hops to trust for client addresses. Behind a CDN, use its hop count.'],
      ['CORS_ORIGIN', '—', 'Only if the dashboard is served from a different origin.'],
    ],
  },
  {
    id: 'whatsapp',
    heading: 'WhatsApp',
    intro: 'Numbers are connected in Settings → WhatsApp. These are for receiving webhooks and defaults.',
    rows: [
      ['META_APP_SECRET', '—', 'Verifies Meta webhook signatures. Required to receive replies from the Cloud API.'],
      ['META_WEBHOOK_VERIFY_TOKEN', '—', 'Any random string; the same value goes in Meta’s webhook form.'],
      ['META_TEMPLATE_LANGUAGE', 'en', 'Default language code of your approved templates.'],
      ['WA_FIRST_TOUCH_TEMPLATE', '—', 'First-contact template for numbers without their own default.'],
      ['AISENSY_WEBHOOK_SECRET', '—', 'Required to accept AiSensy webhooks.'],
      ['WA_WARMUP_WEEK', '1', 'Warm-up stage, 1–8. Controls how quickly daily volume ramps up.'],
    ],
  },
  {
    id: 'email',
    heading: 'Email',
    intro: 'Mailboxes are added in Settings → Email; their credentials are encrypted in the database.',
    rows: [
      ['BREVO_WEBHOOK_PUBLIC_URL', '—', 'Your public HTTPS base address, for Brevo event callbacks.'],
      ['BREVO_WEBHOOK_SECRET', '—', 'Shared secret Brevo must send with each event.'],
    ],
  },
  {
    id: 'security',
    heading: 'Encryption and other webhooks',
    rows: [
      ['LEAD_SYNC_ENCRYPTION_KEY', 'generated', 'Encrypts stored channel credentials. Never change it once set.'],
      ['IMESSAGE_WEBHOOK_SECRET', '—', 'Required to accept BlueBubbles (iMessage) webhooks.'],
    ],
  },
  {
    id: 'mcp',
    heading: 'MCP server',
    rows: [
      ['MCP_SERVICE_TOKEN', '—', 'Shared between the app and the MCP server so it can call the API.'],
      ['MCP_BEARER_TOKEN', '—', 'The token AI clients send. Also the OAuth sign-in password unless OAUTH_PASSWORD is set.'],
      ['OAUTH_PASSWORD', '—', 'Optional separate password for the claude.ai OAuth sign-in step.'],
      ['OUTBOUNDOS_MCP_PORT', '3010', 'Port published for the MCP server.'],
    ],
  },
]

export default function ConfigurationDoc() {
  return (
    <DocsShell slug="configuration">
      <p>
        Outbound OS reads its settings from <code>.env</code> in the project
        folder. Only <code>ADMIN_EMAIL</code> is needed to start; everything
        else is either generated on first boot or belongs to a channel you
        choose to connect. The complete, commented list is{' '}
        <a href={`${site.githubUrl}/blob/main/.env.example`}>.env.example</a>{' '}
        in the repository.
      </p>
      <p>
        After changing <code>.env</code>, apply it with{' '}
        <code>docker compose up -d</code>.
      </p>

      {groups.map((group) => (
        <section key={group.id} aria-labelledby={group.id}>
          <h2 id={group.id}>{group.heading}</h2>
          {group.intro && <p>{group.intro}</p>}
          <div className="table-wrap">
            <table>
              <thead>
                <tr>
                  <th scope="col">Setting</th>
                  <th scope="col">Default</th>
                  <th scope="col">What it does</th>
                </tr>
              </thead>
              <tbody>
                {group.rows.map(([name, def, what]) => (
                  <tr key={name}>
                    <td>
                      <code>{name}</code>
                    </td>
                    <td>{def}</td>
                    <td>{what}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </section>
      ))}

      <h2 id="generated">Generated secrets</h2>
      <p>
        If <code>JWT_SECRET</code> or <code>LEAD_SYNC_ENCRYPTION_KEY</code> is
        empty, the first boot generates it into{' '}
        <code>instance-secrets.json</code> next to the database, in the data
        volume. Keep that file with your backups: without the encryption key,
        saved channel credentials cannot be read. See{' '}
        <Link href="/docs/backups-and-upgrades">backups and upgrades</Link>.
      </p>
    </DocsShell>
  )
}
