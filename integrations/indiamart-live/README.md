# IndiaMART purchased-lead intake

This optional, isolated Chromium runtime checks the signed-in seller's consumed
purchase page every 15 minutes. It reuses the purchased-list endpoint and fields
from the owner's existing scraper. It never purchases leads, exports Chrome
cookies from another device, solves CAPTCHAs or bypasses login.

The first 21 cards establish a baseline and import without outreach. Subsequent
runs fetch bounded 21-card pages until a known **purchase ID** is reached, up to
420 unseen purchases. A larger gap stops without advancing the ledger. A SQLite
outbox records each batch before transmission; only explicit CRM acknowledgments
move IDs into the seen ledger. A changed seller account, empty/malformed page,
expired sign-in or API failure stops progress and exposes a health error.

The API source must be `indiamart_live`, with an enabled attribution supplier,
lead pool and tags. Configure `indiamart.livePolicy` in SystemConfig with
`sourceId`, `sellerId`, `enabled`, `armedAt` (initially null),
`whatsappAccountId`, `emailAccountId` and the approved `templateName`.
The selected email must be linked to the selected WhatsApp persona. Do not use
another business's sending account. The source key authenticates
`/api/webhooks/indiamart/indiamart_live` and its `/health` endpoint.

Only genuinely new contacts with purchases after the baseline and within one
hour receive an outreach intent. Existing contacts, conflicts and historical
purchases stay suppressed. Replays do not convert baseline records into live
outreach. An operator edit/pause between import and hand-off blocks automatic
unpausing. The durable first-touch queue uses only the selected WhatsApp and
email accounts, dispatches immediately when permitted, and retains the CRM's
reply, opt-out, pause, business-hour and rate-limit protections. The email
verifier runs before the actual email send. Individual mailbox existence is
not guaranteed. No historical campaign is launched by enabling this service.

Create `private.env` (mode 600) with `CONTROL_TOKEN` (random 32+ bytes),
`EXPECTED_SELLER_ID`, `SOURCE_KEY` and `INTAKE_URL`. Never commit it. Use
`docker compose up -d --build`. Persistent browser/outbox data lives in the
`browser-state` volume. Back it up with the CRM's source receipts when moving
hosts. Never delete the state to resolve a stuck run; inspect `/status` first.

Ports are published only on host loopback: 6081 for noVNC, 9185 for the control
API. Reach noVNC through a temporary SSH tunnel (for example,
`ssh -N -L 127.0.0.1:6082:127.0.0.1:6081 ubuntu@your-vm`). Open
`http://127.0.0.1:6082/vnc.html?autoconnect=1&resize=scale`, sign in manually,
then close the tunnel. Do not expose noVNC, VNC or Chromium debugging ports to
the Internet or Tailscale peers. The browser profile retains its own login on
the VM. No desktop profile or saved passwords are copied.

The private control API supports authenticated `GET /status` and `POST /run`
using `Authorization: Bearer <CONTROL_TOKEN>`. Health is also visible through
Hermes's existing `system_status` tool, including a stale-report indicator.
The Compose cap is 640 MiB / 0.35 CPU; no new paid infrastructure is required.

Run `npm test --prefix integrations/indiamart-live` and the root unit and
integration suites. Test on an owned account before enabling real automation.
Rollback: disable the intake policy and stop this poller; retain both ledgers.
Queued customer messages must be paused/reviewed separately in the CRM.

Deployment note: IndiaMART returned HTTP 403 to both the purchase page and the
ordinary seller/public homepages from the AWS VM on 2026-10-29. The cloud browser
was stopped and intake remains unconfigured. Do not work around this with copied
cookies or stealth settings. Use an authorized browser relay or official provider
access, and verify a baseline before enabling automation.
