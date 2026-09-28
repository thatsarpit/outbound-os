# Changelog

All notable changes to Outbound OS. This project follows
[semantic versioning](https://semver.org/); until 1.0, minor versions may
include breaking changes, and they are called out here.

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
