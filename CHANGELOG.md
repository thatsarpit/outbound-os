# Changelog

All notable changes to Outbound OS. This project follows
[semantic versioning](https://semver.org/); until 1.0, minor versions may
include breaking changes, and they are called out here.

## [0.2.0] — WhatsApp usernames, Meta pricing, published images

### Fixed

- **WhatsApp messages from people who use a username are no longer lost.**
  Meta identifies them by a business-scoped user id and omits the phone
  number; those webhooks were skipped. They now match or create a lead, and
  replies are addressed to the user id.
- IndiaMART's Lead Manager Push API format (`{CODE, STATUS, RESPONSE}`) is
  read correctly; the preset maps its field names.
- Manual inbox replies store the WhatsApp message id, so delivery receipts
  attach to them.

### Added

- Meta's per-message pricing is recorded from status webhooks, and
  Settings → WhatsApp shows this month's billable messages by category.
  Meta charges for service replies from 1 October 2026.
- Opt-outs in Hindi and Hinglish, Spanish, Portuguese, French, German,
  Italian, Indonesian/Malay, Turkish, Russian and Arabic, plus one-word
  replies such as `PARAR` or `Стоп`.
- Published Docker images on GitHub Container Registry for amd64 and arm64:
  `ghcr.io/thatsarpit/outbound-os` and `ghcr.io/thatsarpit/outbound-os-mcp`.
- MCP tool `whatsapp_costs` (33 tools in total).
- `AGENTS.md` for AI coding agents; the project website lives in `website/`.

### Changed

- `docker compose up -d` pulls the published image instead of building from
  source (it still builds if the pull fails, or with `--build`). Pin a
  version with `OUTBOUNDOS_VERSION`. Update with
  `docker compose pull && docker compose up -d`.
- `.env.example` documents `MCP_BEARER_TOKEN` and `OAUTH_PASSWORD`.
- The MCP `stats_overview` tool uses the workspace time zone.
- `npm run db:push` is replaced by `db:migrate` and `db:migration`.

### Removed

- The MCP `ai_reply_suggestion` tool, which could only return an error since
  the AI layer was removed.

### Upgrading from 0.1.0

A database migration adds WhatsApp identity and pricing columns; it runs on
start. Because 0.1.0 had no published image, run
`git pull && docker compose up -d --build` once; after that,
`docker compose pull && docker compose up -d`.

## [0.1.0] — first public release

The first release as a self-hostable, open-source product.

### Added

- Docker Compose install with automatic database migrations and a generated
  first-admin password; secrets are generated and kept beside the database.
- Built-in email and password sign-in. Clerk is optional
  (`AUTH_PROVIDER=clerk`).
- First-run setup wizard (business details, channels, lead sources, team) and a
  "finish setting up" checklist.
- WhatsApp through Meta's Cloud API directly, with AiSensy as an option, chosen
  per number. Meta webhooks at `/webhook/meta`, signature-checked.
- Integrations catalogue in the dashboard.
- Website forms: spam trap (`_gotcha`), return page (`_next`), email-consent
  checkbox, and a thank-you page for plain HTML posts.
- Workspace settings (identity, time zone, country code, currency) stored in the
  database and applied without a restart.
- GitHub Actions CI: unit and integration tests, dashboard build, and a Docker
  first-boot check.

### Changed

- Everything that meant "today" follows `BUSINESS_TIMEZONE` (default UTC).
- Numbers typed without a country code only get one when
  `DEFAULT_COUNTRY_CODE` is set.
- Orders, products and revenue use the workspace currency.
- The daily marketing email works with one or more Brevo senders and is off by
  default.
- Runs on Node.js 24.

### Removed

- Live IndiaMART polling and the bundled headless browser. IndiaMART and other
  marketplaces connect through their CRM webhooks instead.
- Hosted-service scaffolding (billing, tenancy, access requests).

### Security

- Viewers can no longer change or export data; every write route checks the
  role it needs.
- Provider webhooks (Meta, AiSensy, iMessage, Brevo) reject deliveries until
  their secret is set.
- No fixed default admin password or signing key; login rate limits count
  failed attempts only and cannot be reset with a forged `X-Forwarded-For`.
