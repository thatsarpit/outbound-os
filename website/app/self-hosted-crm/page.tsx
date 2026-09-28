import Link from 'next/link'
import { ArrowRight } from 'lucide-react'
import { Breadcrumbs, Code, Faq, InstallBand, Related, Screenshot } from '@/components/content'
import { buildMetadata } from '@/lib/metadata'
import { LogoPair } from '@/components/logo-pair'
import { installCommands, site } from '@/lib/site-content'

export const metadata = buildMetadata(
  'Self-hosted CRM with Docker — open source',
  'Outbound OS is an open-source, self-hosted CRM you run with one Docker command. Your leads, messages and credentials stay in your own database. AGPL-3.0.',
  '/self-hosted-crm',
)

const faq = [
  {
    q: 'What is a self-hosted CRM?',
    a: 'A CRM you run on your own server instead of renting from a vendor. The database, the backups and the access rules are yours; nobody else can read your customer list, change the price or switch the service off.',
  },
  {
    q: 'What are the server requirements?',
    a: 'Docker and Docker Compose on Linux, macOS or Windows. A cloud server with 1–2 GB of memory and a few gigabytes of disk runs a small team. For WhatsApp replies the server needs a public HTTPS address.',
  },
  {
    q: 'Which database does it use?',
    a: 'SQLite, stored in a Docker volume. It needs no separate database server, and backing up is copying a file — the included backup script checks its integrity first.',
  },
  {
    q: 'How do I update it?',
    a: 'Pull the new code and rebuild: git pull, then docker compose up -d --build. Database migrations run automatically when the app starts.',
  },
  {
    q: 'Can I run it without Docker?',
    a: 'Yes. It is a Node.js 24 application with a React dashboard; the README covers running the API and dashboard directly for development.',
  },
  {
    q: 'Is self-hosting secure?',
    a: 'It can be more private than a hosted CRM, but the responsibility is yours. Outbound OS encrypts stored channel credentials, generates its own signing keys, and has roles for admins, managers, agents and viewers. You keep the server patched, put it behind HTTPS and protect the backups.',
  },
]

export default function SelfHostedCrmPage() {
  return (
    <>
      <section className="section section--lead hero-ground">
        <div className="page landing-hero">
          <Breadcrumbs trail={[{ name: 'Self-hosted CRM', path: '/self-hosted-crm' }]} />
          <LogoPair brands={['outboundos', 'docker']} />
          <p className="eyebrow">Self-hosted CRM</p>
          <h1>A CRM that runs on your server, not someone else&rsquo;s.</h1>
          <p className="lede">
            Outbound OS is an open-source CRM and outreach platform you start
            with one Docker command. Leads, conversations and channel
            credentials live in your own database, on a machine you control,
            for as long as you want — with no per-seat bill.
          </p>
          <div className="hero__actions">
            <Link href="/docs/install" className="btn btn--primary btn--lg">
              Read the install guide
            </Link>
            <a href={site.githubUrl} className="cta-link">
              View on GitHub
              <ArrowRight size={15} aria-hidden="true" />
            </a>
          </div>
        </div>
      </section>

      <section className="section section--ruled">
        <div className="page split">
          <div className="section-head">
            <p className="eyebrow">Install</p>
            <h2>Four commands to a running CRM.</h2>
            <p>
              The first boot creates the database, generates the secret keys
              and makes your admin account. Then the setup wizard asks for your
              business details and first channel.
            </p>
          </div>
          <div>
            <Code label="Terminal">{installCommands.map((line) => `$ ${line}`).join('\n')}</Code>
            <p className="landing-note">
              Open http://localhost:3001 and sign in with the ADMIN_EMAIL you
              set in .env. If you left ADMIN_PASSWORD empty, a generated one is
              printed once in the logs.
            </p>
          </div>
        </div>
      </section>

      <section className="section section--ruled section--raised">
        <div className="page split">
          <div className="section-head">
            <p className="eyebrow">What runs where</p>
            <h2>Small enough to understand, complete enough to run a team.</h2>
          </div>
          <div className="points">
            <div>
              <h3>One app container</h3>
              <p>
                A Node.js API that serves the dashboard, receives webhooks and
                runs the schedulers for first contact, follow-ups and
                campaigns.
              </p>
            </div>
            <div>
              <h3>One data volume</h3>
              <p>
                The SQLite database and the instance&rsquo;s generated keys, in
                a named Docker volume that survives rebuilds.
              </p>
            </div>
            <div>
              <h3>An optional MCP container</h3>
              <p>
                For AI agents such as Claude. Off unless you start it with the
                mcp profile.
              </p>
            </div>
            <div>
              <h3>No telemetry</h3>
              <p>
                The only outside calls are the ones you configure: Meta, your
                mailboxes and the integrations you switch on. Error reporting
                exists only if you add your own Sentry key.
              </p>
            </div>
          </div>
        </div>
      </section>

      <section className="section section--ruled">
        <div className="page split split--reverse">
          <Screenshot
            name="setup"
            alt="Outbound OS setup wizard asking which lead sources to connect"
          />
          <div className="section-head">
            <p className="eyebrow">First sign-in</p>
            <h2>A setup wizard instead of a config file.</h2>
            <p>
              Only an admin email is needed to boot. Business name, time zone,
              currency, default country code, channels and lead sources are all
              set from the dashboard, and nothing sends until you connect it.
            </p>
          </div>
        </div>
      </section>

      <section className="section section--ruled">
        <div className="page">
          <div className="section-head">
            <p className="eyebrow">Trade-offs</p>
            <h2>Self-hosted or hosted: an honest comparison.</h2>
          </div>
          <div className="comparison-wrap">
            <table className="comparison comparison--compact">
              <thead>
                <tr>
                  <th scope="col"></th>
                  <th scope="col">Self-hosted Outbound OS</th>
                  <th scope="col">A typical hosted CRM</th>
                </tr>
              </thead>
              <tbody>
                <tr>
                  <th scope="row">Where the data lives</th>
                  <td><strong>Your server</strong>, your database file</td>
                  <td>The vendor&rsquo;s infrastructure</td>
                </tr>
                <tr>
                  <th scope="row">Pricing</th>
                  <td><strong>Free software</strong>; you pay for the server</td>
                  <td>Usually per seat or per contact, per month</td>
                </tr>
                <tr>
                  <th scope="row">Changing the product</th>
                  <td><strong>Edit the code</strong>, or add a webhook source in settings</td>
                  <td>Limited to what the vendor exposes</td>
                </tr>
                <tr>
                  <th scope="row">Updates and uptime</th>
                  <td>Your job: two commands to update</td>
                  <td><strong>The vendor&rsquo;s job</strong></td>
                </tr>
                <tr>
                  <th scope="row">Support</th>
                  <td>GitHub issues and Discussions, or managed hosting</td>
                  <td><strong>Vendor support</strong>, by plan</td>
                </tr>
              </tbody>
            </table>
          </div>
          <p className="landing-note">
            Want the ownership without running the server?{' '}
            <Link href="/managed-hosting">Managed hosting</Link> sets up and runs an
            instance for you.
          </p>
        </div>
      </section>

      <section className="section section--ruled">
        <div className="page landing-cols">
          <div>
            <h3>Backups</h3>
            <p>
              Back up the database and the instance secrets together — saved
              credentials cannot be decrypted without the secrets file. The
              included script checks the database&rsquo;s integrity and keeps
              seven days.
            </p>
            <Code label="Back up">{'docker compose exec app bash scripts/backup.sh\ndocker compose cp app:/app/data/backups ./backups'}</Code>
          </div>
          <div>
            <h3>Updates</h3>
            <p>
              Pull and rebuild. Migrations run on start, and your data volume
              is untouched by the rebuild.
            </p>
            <Code label="Update">{'git pull\ndocker compose up -d --build'}</Code>
          </div>
        </div>
      </section>

      <Faq items={faq} heading="Self-hosting questions" />

      <Related
        links={[
          { href: '/docs/install', title: 'Install guide', body: 'Docker, HTTPS, first admin and the setup wizard.' },
          { href: '/docs/backups-and-upgrades', title: 'Backups and upgrades', body: 'What to back up, how to restore, how to update.' },
          { href: '/open-source', title: 'The open-source project', body: `${site.license}, the stack, and how to contribute.` },
        ]}
      />

      <InstallBand />
    </>
  )
}
