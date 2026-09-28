# Outbound OS

**Self-hosted outbound sales for teams whose leads arrive everywhere.**

Leads come in from your website, marketplaces, ad forms and spreadsheets.
Outbound OS puts them in one queue, contacts them within seconds on WhatsApp,
email, Telegram or iMessage, follows up on a schedule, and stops the moment
someone replies. It runs on your own server, and your leads never leave your
database.

[![CI](https://github.com/thatsarpit/outbound-os/actions/workflows/ci.yml/badge.svg)](https://github.com/thatsarpit/outbound-os/actions/workflows/ci.yml)
[![License: AGPL v3](https://img.shields.io/badge/License-AGPL_v3-blue.svg)](LICENSE)

---

## What it does

- **Instant first touch.** A lead that arrives by webhook is contacted on every
  channel you have connected, straight away — not when someone next opens the
  dashboard.
- **One inbox for every channel.** WhatsApp, email, Telegram and iMessage
  threads sit side by side on the lead they belong to.
- **Follow-ups that know when to stop.** Sequences run in the lead's working
  hours and end on a reply, an opt-out, or a closed deal.
- **Campaigns** to any slice of your leads (by tag, status, country, score),
  with approved WhatsApp templates for anyone outside the 24-hour window.
- **A pipeline, not just messages.** Status, owner, score, notes, tasks,
  orders and shipment updates live on the same record as the conversation.
- **Built for AI agents.** An MCP server lets Claude or any MCP client search
  leads, import lists, launch campaigns and read replies on your live data.

## What it deliberately doesn't do

- **Bypass channel rules.** WhatsApp goes through Meta's official Cloud API
  (or a Meta partner). Template approval, opt-in and the 24-hour window apply.
  Anything that promises otherwise is asking you to get your number banned.
- **Blast.** Sending limits and warm-up are built in. The design assumes you
  want replies, not volume.

---

## Integrations

| Bring leads in | Reach out | Send data out |
|---|---|---|
| Any website form (HTML, Formspree-style POST, Webflow, WordPress) | **WhatsApp** — Meta Cloud API, or AiSensy | Outgoing webhooks on lead and message events |
| Facebook Lead Ads | **Email** — any SMTP/IMAP inbox, Brevo | Google Sheets (live row sync) |
| IndiaMART, TradeIndia, JustDial (their CRM webhooks) | **Telegram** — your own account | CSV export |
| Engyne Cloud | **iMessage** — via a Mac running BlueBubbles | MCP server for AI clients |
| Zapier, Make, n8n, or your own code (signed webhook) | | |
| CSV / JSON import | | |

Every inbound source is a **signed webhook** with a field map, so a new source
is a settings change, not a code change. Presets exist for the ones above.

### Website forms

Point any HTML form at a lead source — the setup wizard gives you a ready-made
one — and it works like a hosted form backend:

```html
<form action="https://your-host/api/webhooks/inbound/<source>?apiKey=<key>" method="post">
  <input name="name" required>
  <input name="email" type="email">
  <input name="phone">
  <textarea name="message"></textarea>
  <label><input type="checkbox" name="email_consent" value="yes"> Email me updates</label>
  <input type="text" name="_gotcha" style="display:none" tabindex="-1" autocomplete="off">
  <input type="hidden" name="_next" value="https://your-site.com/thanks">
  <button>Send</button>
</form>
```

- `_gotcha` is a spam trap: bots fill it, people never see it, and those
  submissions are dropped.
- `_next` sends the visitor back to a page on your own site; without it they
  see a short thank-you page.
- A ticked `email_consent` (or `marketing_consent`, `newsletter`) records
  marketing consent with its time and source. Unticked means no consent.
- JSON posts from Zapier, Make, n8n or your own code use the same address, with
  the key in an `x-api-key` header.

---

## Quick start (Docker)

You need a machine with Docker. A 1–2 GB VM is plenty for a small team.

```bash
git clone https://github.com/thatsarpit/outbound-os.git
cd outbound-os
cp .env.example .env          # set ADMIN_EMAIL; everything else can wait
docker compose up -d
```

Open <http://localhost:3001> and sign in as `ADMIN_EMAIL`. If you did not set
`ADMIN_PASSWORD`, the first boot prints a generated one:

```bash
docker compose logs app | grep "First admin"
```

Then connect channels in **Settings → WhatsApp**, **Settings → Email** and
**Integrations**. Nothing sends until you do.

Put it behind HTTPS (Caddy, Nginx, Cloudflare Tunnel) before connecting
WhatsApp: Meta only delivers webhooks to a public HTTPS address.

### Your data

Everything is in the `outboundos-data` Docker volume: the SQLite database and
`instance-secrets.json`, the generated keys that sign sessions and encrypt
saved credentials. **Back up both together** — the database's stored
credentials cannot be decrypted without that file.

```bash
docker compose exec app bash scripts/backup.sh
docker compose cp app:/app/data/backups ./backups
```

### Updating

```bash
git pull
docker compose up -d --build
```

Database migrations run automatically on start.

---

## Connecting WhatsApp (Meta Cloud API)

1. Create an app at [developers.facebook.com](https://developers.facebook.com)
   and add the **WhatsApp** product. Add your number under **API Setup**.
2. Create a **System User** in Meta Business Settings, give it the
   `whatsapp_business_messaging` permission, and generate a permanent token.
3. In Outbound OS: **Settings → WhatsApp → Meta Cloud API**, paste the
   **Phone number ID** and the **token**, then **Test connection**.
4. To receive replies, set `META_APP_SECRET` and `META_WEBHOOK_VERIFY_TOKEN`
   in `.env`, then in Meta: **WhatsApp → Configuration → Webhook**, callback
   `https://your-host/webhook/meta`, the same verify token, and subscribe to
   **messages**.

First contact must use an **approved template**. Put its name on a campaign
(or as a number's default) and Outbound OS fills `{{1}}` with the lead's first
name and `{{2}}` with their country.

Already on AiSensy? Pick **AiSensy** instead and paste your API Campaign key.

---

## Configuration

Only these matter to boot; everything else is a channel you opt into. The full
list, with explanations, is in [`.env.example`](.env.example).

| Setting | Default | What it does |
|---|---|---|
| `ADMIN_EMAIL` / `ADMIN_PASSWORD` | generated | The first admin, created on first boot |
| `AUTH_PROVIDER` | `local` | `local` = email + password; `clerk` = Clerk-hosted sign-in |
| `BUSINESS_NAME`, `BUSINESS_WEBSITE`, … | — | Your identity in outgoing messages and emails |
| `BUSINESS_TIMEZONE` | `UTC` | When "today" starts; daily limits and reports use it |
| `DEFAULT_COUNTRY_CODE` | — | Calling code added to numbers typed without one (1, 44, 91…) |
| `BUSINESS_CURRENCY` | `USD` | Currency for supplier costs, profit and reports |
| `META_APP_SECRET`, `META_WEBHOOK_VERIFY_TOKEN` | — | Receiving WhatsApp replies from Meta |
| `CORS_ORIGIN` | — | Only if the dashboard is served from another origin |

`JWT_SECRET` and `LEAD_SYNC_ENCRYPTION_KEY` are generated on first boot if you
leave them blank. Business details, time zone, country code and currency can
also be set in the setup wizard or **Settings → Workspace**; values saved there
win over `.env`.

---

## Development

```bash
cp .env.example .env
npm ci && npm ci --prefix web
npx prisma migrate deploy      # creates data/outboundos.db
npm run dev --prefix web       # dashboard on :5173, proxies /api
npm start                      # API on :3001
```

```bash
npm test                       # unit tests
npm run test:integration       # API tests against a throwaway database
npm run lint --prefix web && npm run build --prefix web
```

| Path | What lives there |
|---|---|
| `src/` | Node/Express API, services, scheduled jobs |
| `src/services/whatsappProviders.js` | What each WhatsApp provider needs |
| `web/` | React + Vite dashboard |
| `prisma/` | Schema and migrations (SQLite) |
| `mcp-outboundos/` | MCP server (`docker compose --profile mcp up -d`) |
| `android/` | Native Android companion app |
| `test/` | Unit and integration tests |

Adding a lead source or a channel? Read
[`docs/integrations.md`](docs/integrations.md) first.

## Contributing

See [`CONTRIBUTING.md`](CONTRIBUTING.md). Issues labelled `good first issue`
are a good place to start.

## Security

**Please do not open a public issue for a vulnerability.** See
[`SECURITY.md`](SECURITY.md) for private disclosure.

Self-hosting means the obligations that come with contact data and messaging
are yours: keep `.env` and backups private, rotate credentials, and follow the
consent and record-keeping rules where you operate.

## License

[AGPL-3.0](LICENSE). Use, modify and self-host it freely, including
commercially. If you run a modified version as a network service, you must
make your changes available under the same license.
