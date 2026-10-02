import Link from 'next/link'
import { Code } from '@/components/content'
import { DocsShell, docMetadata } from '@/components/docs-shell'
import { installCommands } from '@/lib/site-content'
import { nginxExample } from '@/lib/setup-examples'

export const metadata = docMetadata('install')

export default function InstallDoc() {
  return (
    <DocsShell slug="install">
      <p>
        Outbound OS runs as a Docker Compose app: one container for the API and
        dashboard, and one named volume for the database. This guide takes a
        fresh machine to a signed-in admin in about five minutes, then puts it
        behind HTTPS so WhatsApp can deliver replies.
      </p>

      <h2 id="requirements">What you need</h2>
      <ul>
        <li>
          <strong>Docker Engine with Compose v2</strong> — on a Linux server,
          a Mac or Windows. <code>docker compose version</code> should print a
          version.
        </li>
        <li>
          <strong>1–2 GB of memory</strong> and a few gigabytes of disk. A
          small cloud server is plenty for a team.
        </li>
        <li>
          <strong>A domain name</strong>, when you are ready to connect
          WhatsApp. Meta only delivers webhooks to a public HTTPS address.
          Trying it locally first needs neither.
        </li>
      </ul>

      <h2 id="start">1. Download and start</h2>
      <Code label="Terminal">{installCommands.join('\n')}</Code>
      <p>
        Before the last command, open <code>.env</code> and set{' '}
        <code>ADMIN_EMAIL</code> to the address you will sign in with. Every
        other setting can wait — the{' '}
        <Link href="/docs/configuration">configuration reference</Link> lists
        them.
      </p>
      <p>
        The first start downloads the ready-made image (for Intel and ARM
        servers), creates the database, runs the migrations and generates the
        instance&rsquo;s secret keys. It usually takes under a minute.
      </p>

      <h2 id="sign-in">2. Sign in</h2>
      <p>
        Open <code>http://localhost:3001</code> (or your server&rsquo;s address
        on port 3001) and sign in with <code>ADMIN_EMAIL</code>. If you did not
        set <code>ADMIN_PASSWORD</code>, a generated password was printed once
        in the log:
      </p>
      <Code label="Terminal">{'docker compose logs app | grep "First admin"'}</Code>
      <p>Change it from your account page after signing in.</p>

      <h2 id="render">Hosted alternative: Render Blueprint</h2>
      <p>
        <a href="https://render.com/deploy?repo=https%3A%2F%2Fgithub.com%2Fthatsarpit%2Foutbound-os">
          <img src="https://render.com/images/deploy-to-render-button.svg" alt="Deploy to Render" width="147" height="32" />
        </a>
      </p>
      <ol>
        <li>Sign in to Render and open the deploy button. Review the service and disk charges before creating the Blueprint.</li>
        <li>Enter <code>ADMIN_EMAIL</code> when prompted. The Blueprint uses the published image, built-in sign-in and a persistent disk mounted at <code>/app/data</code>.</li>
        <li>Wait for the <code>/healthz</code> check to pass, then open the service&rsquo;s HTTPS URL.</li>
        <li>Open the service&rsquo;s <strong>Logs</strong> and search for <code>First admin created</code>. Sign in with the generated password and change it from your account page.</li>
        <li>Run the setup wizard. Configure channel credentials and webhook secrets only when you are ready to connect those providers.</li>
      </ol>
      <p>
        A paid service and disk are required. Keep <code>DATABASE_URL=file:/app/data/outboundos.db</code>
        and the disk mount unchanged: the database and generated encryption keys must survive together.
        Use one service instance for this SQLite deployment. Fork the repository and pin a released
        image tag in <code>render.yaml</code> for controlled upgrades. Render supplies HTTPS automatically.
        See <Link href="/docs/backups-and-upgrades">backups and upgrades</Link> before redeploying.
      </p>

      <h2 id="wizard">3. Run the setup wizard</h2>
      <p>
        The first sign-in opens the setup wizard. It asks for your business
        name, time zone, currency and default country code, which lead sources
        you use, and walks you through your first channel. Nothing sends until
        you connect a channel.
      </p>

      <h2 id="https">4. Put it behind HTTPS</h2>
      <p>
        For WhatsApp replies, Brevo events and website forms on other domains,
        the app needs a public HTTPS address. Any reverse proxy works. With{' '}
        <a href="https://caddyserver.com/">Caddy</a>, which fetches the
        certificate for you, the whole configuration is:
      </p>
      <Code label="Caddyfile">{'crm.example.com {\n  reverse_proxy localhost:3001\n}'}</Code>
      <h3 id="nginx">Nginx</h3>
      <p>
        On an Ubuntu or Debian server, install Nginx and Certbot, replace
        <code> crm.example.com</code> with your domain, and save this as
        <code> /etc/nginx/sites-available/outbound-os</code>. Point the domain&rsquo;s DNS at the server
        and allow ports 80 and 443. In <code>docker-compose.yml</code>, replace the app&rsquo;s
        port entry with <code>&quot;127.0.0.1:3001:3001&quot;</code>, then run
        <code> docker compose up -d</code>, so visitors reach it through Nginx.
      </p>
      <Code label="/etc/nginx/sites-available/outbound-os">{nginxExample}</Code>
      <Code label="Terminal">{`sudo apt-get update
sudo apt-get install nginx certbot python3-certbot-nginx
sudo ln -s /etc/nginx/sites-available/outbound-os /etc/nginx/sites-enabled/outbound-os
sudo nginx -t && sudo systemctl reload nginx
sudo certbot --nginx -d crm.example.com
sudo certbot renew --dry-run`}</Code>
      <p>
        Certbot adds the TLS certificate and HTTPS redirect. The separate <code>/api/events</code>
        location disables buffering and keeps the live event stream open. The forwarded headers
        preserve the public scheme and client address. If Node runs directly on the host,
        set <code>TRUST_PROXY=loopback</code>. With this Docker setup, host Nginx normally
        reaches the app through Docker&rsquo;s bridge gateway. Find that address with the command
        below, set <code>TRUST_PROXY</code> in <code>.env</code> to it, then recreate the app
        with <code>docker compose up -d</code>. For other networks or a CDN, configure only
        the actual trusted proxy addresses. Do not trust arbitrary client-supplied headers.
      </p>
      <Code label="Find the Docker bridge gateway">{'docker inspect "$(docker compose ps -q app)" --format \'{{range .NetworkSettings.Networks}}{{.Gateway}}{{end}}\''}</Code>
      <p>
        No open ports? A{' '}
        <a href="https://developers.cloudflare.com/cloudflare-one/connections/connect-networks/">
          Cloudflare Tunnel
        </a>{' '}
        pointed at <code>http://localhost:3001</code> gives you an HTTPS address
        without exposing the machine. Behind a CDN, set{' '}
        <code>TRUST_PROXY</code> to the number of proxy hops so rate limits see
        real client addresses.
      </p>

      <h2 id="next">5. Connect your channels</h2>
      <ul>
        <li>
          <Link href="/docs/whatsapp-cloud-api">Connect the WhatsApp Cloud API</Link> — about
          fifteen minutes in Meta&rsquo;s developer console.
        </li>
        <li>
          <strong>Email</strong> — Settings → Email → Add account, with SMTP
          and IMAP details or a Brevo key.
        </li>
        <li>
          <Link href="/docs/website-forms">Send leads in</Link> from your
          website forms, ads and marketplaces.
        </li>
      </ul>

      <h2 id="troubleshooting">Troubleshooting</h2>
      <h3>The page does not load</h3>
      <p>
        Check the container is running and healthy with{' '}
        <code>docker compose ps</code>, and read the last lines of{' '}
        <code>docker compose logs app</code>. Port 3001 already in use? Set{' '}
        <code>OUTBOUNDOS_PORT</code> in <code>.env</code> to another port and
        start again.
      </p>
      <h3>I lost the admin password</h3>
      <p>
        Set a new one from the server. The script asks for the password
        instead of taking it on the command line, so it stays out of your
        shell history:
      </p>
      <Code label="Terminal">{'docker compose exec -it app node scripts/reset-password.mjs you@example.com'}</Code>
      <h3>Saved credentials stopped working after a move</h3>
      <p>
        The database was restored without its <code>instance-secrets.json</code>.
        See <Link href="/docs/backups-and-upgrades">backups and upgrades</Link>.
      </p>
    </DocsShell>
  )
}
