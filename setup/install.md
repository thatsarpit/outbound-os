# Set up Outbound OS

Two ways to run it. Docker is the one to use for a real install; the manual
path is for development.

Never paste secrets into chat, and never commit `.env`, a database, an export
or a backup.

## Docker (recommended)

Use Docker with the Compose v2 plugin. Run the command on the machine hosting
Docker. On Windows, use WSL2 with Docker Desktop integration enabled.

    git clone https://github.com/thatsarpit/outbound-os.git
    cd outbound-os
    bash setup/install.sh

The installer asks for your admin email, builds the current checkout, starts
it on loopback, and opens a hidden password prompt. Node.js runs in Docker.
When it finishes, open the printed sign-in address and follow the app's
setup wizard. Use the same command again to resume after a failed build or
interrupted password setup. On a VPS, open the sign-in address through an SSH
port forward or the HTTPS proxy below.

Optional settings for a new install:

    bash setup/install.sh --email admin@example.com --business "Your business" --timezone Asia/Kolkata --port 3001

A release that supports guided setup can be selected with
`--version RELEASE` (omit the leading v). The installer saves its image
digest in `.env`. New flags are only accepted before the settings are saved.
In a noninteractive terminal, the installer prints the command for setting
the first password and exits until that step is complete. Enter the password
at the private server terminal. Keep credentials out of arguments and chats.

### Publish through HTTPS

On a VPS you can pass `--public-url https://crm.example.com` on first setup.
Point a host reverse proxy or tunnel at the printed loopback port. Configure
DNS, a trusted certificate and the correct `TRUST_PROXY` for your topology.
Then run `bash setup/install.sh --check` to verify health over HTTPS. That
check covers reachability. Confirm sign-in and provider webhook validation
before enabling channels. A proxy running in Docker can reach the app over
a shared Docker network. Its own loopback points at the proxy container.

### Existing and manual Docker setups

Keep the existing `.env` and named volumes. The guided installer declines
existing configurations it did not create. For manual setup, copy
`.env.example` to `.env`, set `ADMIN_EMAIL`, then run
`docker compose up -d`. Supply the first password privately through the
deployment environment or set it from a private terminal:

    docker compose exec app npm run reset-password -- admin@example.com

You can change your password under **Account**. Password changes and terminal
resets end older local sessions.

When upgrading to this Compose file, the app and optional MCP ports default
to loopback. A reverse proxy on the host can keep using those ports. For an
existing protected network topology that requires another bind address, set
`OUTBOUNDOS_BIND_ADDRESS` or `OUTBOUNDOS_MCP_BIND_ADDRESS` deliberately.
Keep unencrypted sign-in off public interfaces.

## Build from source and upgrade

Before upgrading, verify a recovery set using the [backup and restore
guide](backups.md). Retain the old image alongside the recovery set.
Restore the pre-upgrade recovery set before starting an older image. Save
any records you need from after the upgrade before rolling back.

- **Guided source build.** Save the current image under a separate local tag,
  update the checkout and run `docker compose up -d --build --pull never app`.
- **Guided registry install.** Get `compose-images.env` from the successful
  [Docker images workflow](https://github.com/thatsarpit/outbound-os/actions/workflows/docker-publish.yml)
  for the release. Copy `OUTBOUNDOS_APP_IMAGE` into
  the existing `.env`. If MCP is enabled, copy `OUTBOUNDOS_MCP_IMAGE` as well
  and include `--profile mcp` in the Compose commands. Keep your existing
  configuration and save the previous image references with the recovery set.
- **Manual registry install.** Set `OUTBOUNDOS_VERSION` in `.env` to the release
  tag without the leading v, then run `docker compose pull && docker compose up -d`.

For a digest-based upgrade, pull the selected images before switching
containers.

```bash
docker compose pull
docker compose up -d --no-build --pull never --wait --wait-timeout 150
```

Check the app with `docker compose ps`. Guided installs can also run
`bash setup/install.sh --check`. The Docker images workflow tests the exact
app and MCP digests on Linux amd64 and arm64 before applying release tags.
Its rollback check uses an isolated copy of the pre-upgrade data.

Health verifies process/database readiness. Also sign in and check channel
readiness and webhook verification before sending. Do not use customer
outreach as an installation test. Validate a restore with automation disabled
and provider credentials removed, so restored queues cannot send messages.

After an approved test send, open **Delivery review** as a manager or admin.
Compare **Queue scans** with the **Provider receipts** timestamps for WhatsApp
or Brevo. A new receipt shows that the instance recorded provider feedback.
If the provider shows a delivery update and you see no receipt for the test,
check the webhook URL, credentials and provider logs. An unmatched
receipt may arrive before its message is saved. Check the provider and
conversation before retrying the message.

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

## Review interrupted WhatsApp messages

An interrupted follow-up that stopped during preparation can return to the
queue. If submission may have started, Outbound OS holds the message as
**Confirmation unknown**. Older interrupted messages without a recorded
submission state are also held. Check the provider's message history before
sending anything again. A later receipt can update the conversation when its
provider message ID was saved. When periodic recovery is enabled, it checks active attempts once they have
been idle for five minutes.

## Check an install

```bash
npm run preflight -- .env        # configuration problems and warnings
npm test
npm run test:integration
```

When a step fails, see [troubleshooting.md](troubleshooting.md).
