# Set up Outbound OS

Two ways to run it. Docker is the one to use for a real install; the manual
path is for development.

Never paste secrets into chat, and never commit `.env`, a database, an export
or a backup.

## Docker (recommended)

Needs Docker with Compose v2.

The published image supports Linux amd64 and arm64, including Docker Desktop
on Apple Silicon. A Docker install does not need Node.js on the host. Windows
users should run the commands in WSL2 with Docker Desktop integration enabled.

```bash
git clone https://github.com/thatsarpit/outbound-os.git
cd outbound-os
cp .env.example .env
```

Edit `.env` and set at least `ADMIN_EMAIL` (and `BUSINESS_NAME`,
`BUSINESS_TIMEZONE` while you are there). Leave `JWT_SECRET` and
`LEAD_SYNC_ENCRYPTION_KEY` blank: they are generated on first boot.

```bash
docker compose up -d
docker compose ps
```

If you left `ADMIN_PASSWORD` blank, set it from a private terminal before
trying to sign in. Replace the example address with your admin email.

```bash
docker compose exec app npm run reset-password -- admin@example.com
```

Open <http://localhost:3001> and sign in. You can change the password under
**Account**. Password changes and terminal resets end older local sessions.
When upgrading from a release that predates this change, local users need to
sign in again.

Before connecting WhatsApp, put the app behind HTTPS on a public hostname
(Caddy, Nginx or a Cloudflare Tunnel all work). Meta will not deliver webhooks
to `http://` or `localhost`.

Compose publishes the app port on all host interfaces. On a public server,
restrict that port in the host/cloud firewall and expose HTTPS through your
proxy. Configure `TRUST_PROXY` for that proxy's actual topology. Do not expose
an unencrypted sign-in endpoint to the internet.

## Build from source and upgrade

Compose normally uses the published image; a source checkout alone does not
mean you are running that checkout. For a deliberate local source build:

```bash
docker compose up -d --build --pull never
```

For a published release, pin `OUTBOUNDOS_VERSION` in `.env` to the release tag
without the leading `v`. Before upgrading, verify a recovery set using the
[backup and restore guide](backups.md). Retain the old image version alongside
the recovery set. An older application image may be incompatible with an
upgraded database.

```bash
docker compose pull
docker compose up -d
docker compose ps
curl --fail http://localhost:3001/healthz
```

Health verifies process/database readiness. Also sign in and check channel
readiness and webhook verification before sending. Do not use customer
outreach as an installation test. Validate a restore with automation disabled
and provider credentials removed, so restored queues cannot send messages.

## Manual (development)

Needs Node.js 24+.

```bash
cp .env.example .env
npm ci
npm ci --prefix web
npx prisma migrate deploy        # creates data/outboundos.db
npm run build --prefix web
npm start
```

Open <http://localhost:3001>. For live reloading of the dashboard, run
`npm run dev --prefix web` alongside `npm start` and open
<http://localhost:5173> instead.

## Connect channels

Everything is off until you connect it; an empty credential means disabled,
never simulated success.

- **WhatsApp** — Integrations → WhatsApp. Uses Meta's official Cloud API.
  The README has the step-by-step setup.
- **Email** — Integrations → Email. SMTP/IMAP accounts, or Brevo for sending.
- **Telegram** — Integrations → Telegram.
- **iMessage** — Integrations → iMessage; needs a Mac running BlueBubbles, see
  [docs/imessage-mac-mini-setup.md](../docs/imessage-mac-mini-setup.md).
- **Lead sources** — Integrations → Webhooks. Pick a preset (website form,
  Facebook Lead Ads, external marketplaces, TradeIndia, JustDial, Engyne Cloud) or map
  your own fields.

## WhatsApp sending limits

Review both limits for each enabled WhatsApp sender before upgrading. The
hourly limit covers the last 60 minutes. The daily limit follows the
workspace time zone. A provider submission attempt consumes a slot even when
the provider rejects it or the outcome is uncertain. Attempts include
manual replies, templates, and attachments. Reactions and sign-in codes
use their own controls. Restarting the app or resetting the old reporting
counters does not clear the limits.

A follow-up waits until a slot may be available. A campaign pauses with the
remaining recipients pending. Resume it after checking sender capacity.
Retry a quota-held attachment batch with the same request ID so files
already accepted are not submitted again.

The migration carries forward recent attempts with a sender and send
evidence in Message history. Older submissions absent from that history
cannot be counted. A backup taken before the migration can restore the
old schema if you need to revert the release.

## Check an install

```bash
npm run preflight -- .env        # configuration problems and warnings
npm test
npm run test:integration
```

When a step fails, see [troubleshooting.md](troubleshooting.md).
