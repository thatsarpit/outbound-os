# Set up Outbound OS

Two ways to run it. Docker is the one to use for a real install; the manual
path is for development.

Never paste secrets into chat, and never commit `.env`, a database, an export
or a backup.

## Docker (recommended)

Needs Docker with Compose v2.

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
docker compose logs app | grep "First admin"   # generated password, if you set none
```

Open <http://localhost:3001> and sign in. Change the password under
**Account**.

Before connecting WhatsApp, put the app behind HTTPS on a public hostname
(Caddy, Nginx or a Cloudflare Tunnel all work). Meta will not deliver webhooks
to `http://` or `localhost`.

## Manual (development)

Needs Node.js 20+.

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

- **WhatsApp** — Settings → WhatsApp. Choose Meta Cloud API (recommended) or
  AiSensy. The README has the step-by-step for Meta.
- **Email** — Settings → Email. Any SMTP/IMAP mailbox, or Brevo.
- **Telegram** — Integrations → Telegram.
- **iMessage** — Settings → iMessage; needs a Mac running BlueBubbles, see
  [docs/imessage-mac-mini-setup.md](../docs/imessage-mac-mini-setup.md).
- **Lead sources** — Integrations → Webhooks. Pick a preset (website form,
  Facebook Lead Ads, IndiaMART, TradeIndia, JustDial, Engyne Cloud) or map
  your own fields.

## Check an install

```bash
npm run preflight -- .env        # configuration problems and warnings
npm test
npm run test:integration
```

When a step fails, see [troubleshooting.md](troubleshooting.md).
