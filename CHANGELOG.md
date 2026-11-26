# Changelog

All notable changes to Outbound OS. This project follows
[semantic versioning](https://semver.org/); until 1.0, minor versions may
include breaking changes, and they are called out here.

## [Unreleased]

## [0.6.0] — release candidate

- Offer private Sales workspaces where agents work only their assignments and
  can claim eligible new WhatsApp inbounds. Admins retain the full Inbox.
- Allow an admin to own automated first touch and retain live IndiaMART leads.
  Route newly captured website enquiries by source with outreach paused.
- Record closed deals from mobile Lead details.
- Add optional expiring Browser chat links and show their messages alongside
  existing channels in the Inbox.

## [0.5.2] — 26 November 2026

- Separate email sending verification from receiving. Show the last incoming
  mail, matched reply and confirmed outbound delivery per mailbox.
- Preserve receiving errors across successful outbound sends.
- Stop sales email to addresses with a verified unsubscribe request and hold
  unverified requests for review. Keep unsubscribe mail out of reply metrics.
- Flag mail from an earlier recipient address for review and open Other email
  from mobile Inbox.
- Keep mobile conversation history and drafts visible when a refresh fails.

## [0.5.1] — 26 November 2026

- Allow pinch zoom in the Home Screen app. Keep the conversation layout stable
  while zooming and follow the keyboard at normal scale.
- Preserve lead searches and follow-up filters in mobile URLs. Keep loaded
  Inbox, Leads and Tasks visible when a refresh fails and offer a retry.
- Show Account in the phone navigation and distinguish empty inbox queues.
- Require a matching, current release tag and built dashboard for production
  publishing.

## [0.5.0] — 26 November 2026

- Show confirmed outbound channels in each inbox row and keep the selected reply
  channel explicit in the conversation.
- Call a lead using the device’s dialer from a conversation or lead details.
- Distinguish WhatsApp first contact and waiting for a reply from a window that
  actually expired. Keep email composition independent.
- Preserve mobile inbox filters and email reply context in links. Require the
  original mailbox for a quoted email, and show email options in a dialog.
- Improve keyboard navigation, expose an accessible order action, and require
  a confirmation before starting a Google Sheets backfill.
- Add opt-in Clerk workspaces in one Compose project with separate data
  volumes and runtimes. See [workspace setup](docs/workspaces.md).
- Add read-only, paginated inbox and follow-up triage tools to MCP.
- Update Next.js to 16.4.5.

- Update the Effect dependency used by Prisma to address GHSA-7589-6fvf-x4pw.
- Filter Leads by recorded outbound acceptance independently of pipeline stage.
- Restore a lead’s previous sales stage after an operator resumes its outreach.
  Record pause and resume actions in Activity.
- Rehearse an online recovery-set restore and authenticated MCP connectivity
  before promoting Docker release images.
- Report available space on the database volume and warn when it is nearly full.
- Add a manager-controlled workspace outreach pause in Delivery review that
  holds new automated submissions across the configured sending channels.
- Require a current launch review for both immediate and scheduled campaigns,
  and reject approvals after the draft or pending recipient set changes.
- Edit and discard campaign drafts from the dashboard. Changing a draft’s
  channel, audience filters or sender clears its prepared audience.
- Keep keyboard focus inside open detail drawers and restore it when they close.
- Cancel or reschedule email while it is still queued on desktop and mobile.
- Open Delivery review email conversations with the original sender selected
  and prompt the operator to choose if that sender is unavailable.
- Test an intake payload from workspace setup without creating leads or sending
  messages, and show sending verification alongside channel configuration.
- Preview CSV mapping, duplicate counts and invalid records before importing
  in the dashboard. Reject stale previews when the file or matching leads change.
- Import email-only contacts. Skip email-only rows matching an existing
  address while preserving the existing records and opt-outs.

- Show the dashboard and server version and source revision under **About
  Outbound OS**. Label development builds and check that Docker release tags
  match the product version.

- Show the latest WhatsApp and Brevo webhook receipts on file and counts of
  unmatched receipts in Delivery review.

- Show the last due-work scan for WhatsApp, email, iMessage and scheduled
  campaigns. Delivery review flags queued messages five minutes past their
  scheduled time, with a separate filter ordered by oldest scheduled time.

- Add Delivery review for managers and admins. Filter queued, sending, failed
  and unconfirmed attempts by channel and open the related conversation or
  campaign for investigation. The legacy requeue action blocks attempts with
  evidence of provider acceptance and protects against concurrent updates.

- Keep formatting and attachments on scheduled inbox emails, reject invalid
  dates and deduplicate retries of the same schedule request. Show queued
  emails and failed or interrupted submissions in the conversation.

- Resume workspace setup on desktop and mobile, including after opening
  integrations, CSV import or Team. Preserve the checklist when an admin
  skips a core step and show profile validation beside the affected input.
- Give compiled dashboard files a separate request budget and cache
  fingerprinted files to keep refreshes from interrupting setup.

- Gate Docker release tags on fresh install, upgrade, rollback and MCP checks
  on Linux amd64 and arm64. The release workflow records a matching app and
  MCP digest pair for Compose upgrades.

- Add guided Docker setup with a private first-password prompt and resumable
  configuration. App and MCP ports default to loopback. Existing proxies
  that depend on another bind address can set it explicitly.

- Recover interrupted WhatsApp follow-ups using the saved submission state.
  Preparation can return to the queue. Submission without a confirmed outcome
  stays available for review in the conversation.

- Enforce the WhatsApp sender's rolling hourly and workspace-day limits for
  customer message attempts. Local quota holds defer follow-ups, pause
  campaigns with pending recipients, and preserve attachment batch identity.

- Set the first local admin password in deployment configuration or through the
  server's reset command. Startup no longer generates a password for the logs.
- Changing or resetting a local password ends older API and live-update
  sessions. The dashboard keeps the new session after a password change.
  Local users sign in again the first time they upgrade to this release.

## [0.4.0] — 25 October 2026

Dashboard workflows, retained email and production sign-in repairs from #53,
#57 and #63 are merged and deployed. API/MCP images and the production dashboard
were released together; the existing legacy MCP authentication mode is retained.

### Dashboard reliability and daily sales

- Fix CSV parsing, import result counts, removed-pool requirements and exact audience tags.
- Preserve campaign sender identity and approved template names, recheck lead eligibility
  before dispatch, retain provider IDs, and distinguish skipped recipients from failed sends.
- Paginate Pipeline, Campaigns, Orders, Customers and recorded Activity with complete counts.
- Add desktop Tasks, ownership filters, accessible stage changes, account/device management
  and shared Clerk/local teammate assignment without inventing authentication users.
- Persist personal notification reads, use committed event identities and retain later
  notifications when marking an older displayed batch read.
- Keep financial totals separate by stored currency and product unit; label lifetime
  invoice figures independently from the selected order period.
- Show stale/error/permission states explicitly and stop offering unauthorized lead actions.

### Email and AI integrations

- Add dashboard-sign-in MCP consent, read-only personal grants, immediate revocation,
  rotating credentials and operation-bound API authorization. Personal authorization
  remains opt-in and is not activated by this deployment; legacy mode stays the default.
- Preserve existing legacy MCP credentials across upgrades, and support validated
  provider-scoped teammate discovery and assignment without giving the service a
  personal identity. Numeric assignment IDs remain supported for local sign-in.
- Add a shared inbound email receipt pipeline, encrypted immutable originals, administrator
  reading/reprocessing and authenticated attachment downloads from retained originals.
  Verify original and attachment integrity and force binary downloads; this is not
  malware scanning. Older mail without retained originals reports unavailable files.
- Add Cloudflare relay support with a controlled private KV/Queues pilot for an
  owned test alias. Customer aliases still use Gmail/IMAP; broader routing, storage
  monitoring, retention and recovery acceptance remain open.
- Include retained encrypted MIME objects in companion database backups. Instance secrets
  still require a separate operator backup.

See [upgrade and acceptance](docs/dashboard-repair-upgrade.md) for the migrations,
changed response contracts, verified deployment and remaining acceptance work.

### Sign-in and live updates

- Restore Clerk EventSource authentication before the ordinary API header guard.
  Signed query sessions keep signature, expiry, pinned-organization and role checks;
  other API routes do not accept query authentication.
- Show Clerk's enabled social sign-in providers alongside email with themed 44px
  controls, retaining branding and existing-member signup restrictions. Production
  owner login, Google account linking, authenticated reads and live updates were verified.
- Keep Gmail/Outlook OAuth mailbox connections, passkeys and full physical iPhone
  Safari/Home Screen acceptance separate from the completed login release.

### Security

- Update API and MCP dependencies to patched URI parsing, compressed request body,
  multipart upload, email address parsing and schema validation releases. Preserve
  existing campaign filter and bulk-action tool inputs with the validator upgrade.
- Rate-limit dashboard assets and SPA routes with one shared per-client budget.
  Keep API limits separate and exclude provider webhooks and health probes.

## [0.3.0] — Inbox reliability, mobile sales and direct Meta

### Inbox and mobile

- Retain failed and uncertain manual WhatsApp attempts; distinguish provider
  acceptance from delivered/read receipts and enforce the exact number's reply window.
- Prevent duplicate manual claims and automatic retries of interrupted manual sends.
- Persist scoped Meta receipts and replay callbacks that arrive before send results.
- Separate personal read cursors and Done/Reopen from the sales pipeline.
- Add the focused mobile account/More flow, automatic inbox updates, safe-area and
  keyboard layout handling, app icons and permission-based personal Web Push.
- Preserve delivery diagnostics in MCP, with caller-known identities for text/file retries.
- Add a discoverable AI agents & MCP setup page, public endpoint diagnostics and
  ChatGPT/Codex instructions without revealing integration credentials.

### Website and maintenance

- Unify the marketing site around direct Meta, a shared inbox and mobile sales.
  Use the app's dark design system, actual product captures with sample records
  and animated workflow, integration and MCP explanations.
- Redesign desktop and mobile sign-in while preserving Clerk's authentication
  flow and visible branding. Gate passkey enrolment on actual instance/browser
  support and the separately planned live-instance cutover.
- Clarify incoming source keys versus outgoing event signatures. Preserve retired
  URLs with permanent redirects; verify exact canonical/sitemap correspondence,
  unique titles/descriptions, image assets, structured data and internal links.
- Keep motion optional and reduced-motion aware, with no added animation framework.
- Include the accumulated dependency/security upgrades and protected CI workflow.

### Source-neutral imports and attribution

- Remove the dedicated marketplace preset, legacy Android channel, vendor aliases, public integration page and branding. External collectors now use a generic source contract.
- Add a replay-safe connector receipt ledger, paused historical imports, conflict quarantine, and stable lead-origin supplier attribution independent of order fulfilment.
- Add order filtering by the supplier who originated a lead, and preserve that origin on each new order.
- Protect configured source suppliers with a foreign key; disable referenced
  suppliers instead of deleting them. Bound contact hydration during imports and
  replay accepted records without scanning the workspace.

### Added

- A refreshed website with paid setup, managed hosting and support enquiries,
  current dashboard screenshots and checks for exported SEO metadata and links.
- An opt-in, rate-limited website enquiry endpoint that records paused leads
  without granting marketing consent or scheduling outreach.

- **WhatsApp files in both directions** (Meta Cloud API numbers). Photos,
  PDFs, documents, voice notes and videos a lead sends are downloaded from
  Meta, kept in the data volume and shown in the inbox; they are served only
  to signed-in users, with a sandbox policy. The inbox can attach files to a
  WhatsApp reply, and `POST /api/leads/:id/send-media` sends library files.
- MCP tools `list_media_files` and `send_whatsapp_file` (36 tools).
- More file types in the media library: spreadsheets, presentations, text,
  AAC and M4A audio.
- **Live demo** at outboundos.space/demo: the dashboard on sample data, no
  sign-up. Sending in the inbox works in the browser (delivery ticks, a reply
  from the lead); other changes explain that nothing is saved. Built with
  `npm run build:demo --prefix web`.

### Changed

- **Breaking:** WhatsApp now connects only through Meta's official Cloud API.
  The old provider transport, webhook, credential fields and dashboard controls
  are removed. The upgrade retains conversations and account IDs, disables
  retired-provider accounts and clears incompatible default template labels.
  See `docs/meta-only-upgrade.md` before upgrading an existing installation.

- Incoming media placeholders read `[Photo]`, `[Voice message]` or
  `[Document] name.pdf` instead of `[image]`.

### Fixed

- **A reply always stops automation.** A lead whose status was still "new"
  (everyone who writes to you first) or "no WhatsApp" could not move to
  "replied": the reply was stored, but queued follow-ups kept going and the
  lead never showed as replied. Follow-ups are now cancelled before any status
  check, and those transitions are allowed.
- **Several photos sent together are all kept.** Inbound messages with a
  provider id were also de-duplicated by text, so three uncaptioned photos
  (all "[Photo]") became one, and a second "ok" vanished.
- **Email and iMessage reach leads WhatsApp cannot.** Email campaigns and
  iMessage sends skipped every lead marked "no WhatsApp", the people those
  channels exist for.
- **One lead per person from lead webhooks.** A lead that arrived by email
  only, then again with a phone number, became two leads and got the
  first-contact messages twice. The number now fills in the first lead.
- The Google Sheets settings page reports a failed save instead of looking
  saved.
- Removed an unused sign-in check that still accepted a shared admin password
  in a header or `?pass=` query string.
- The inbox conversation on desktop now opens at the newest message and
  follows new ones. The scroll target was shared with the hidden phone
  drawer, so the desktop timeline never scrolled.
- A failure reported by two handlers no longer shows two toasts.
- Orders, Products, Customers, Revenue and Setup show their name in the top
  bar instead of "Dashboard".

## [0.2.0] — WhatsApp usernames, Meta pricing, published images

### Fixed

- **WhatsApp messages from people who use a username are no longer lost.**
  Meta identifies them by a business-scoped user id and omits the phone
  number; those webhooks were skipped. They now match or create a lead, and
  replies are addressed to the user id.
- external marketplaces's Lead Manager Push API format (`{CODE, STATUS, RESPONSE}`) is
  read correctly; the preset maps its field names.
- Manual inbox replies store the WhatsApp message id, so delivery receipts
  attach to them.

### Added

- Meta's per-message pricing is recorded from status webhooks, and
  Settings → WhatsApp shows this month's billable messages by category.
  Counts follow the billable flag and category in Meta delivery receipts.
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
- WhatsApp through official API connections, configured per number. Meta webhooks at `/webhook/meta`, signature-checked.
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

- Live external marketplaces polling and the bundled headless browser. external marketplaces and other
  marketplaces connect through their CRM webhooks instead.
- Hosted-service scaffolding (billing, tenancy, access requests).

### Security

- Viewers can no longer change or export data; every write route checks the
  role it needs.
- Provider webhooks (Meta, iMessage, Brevo) reject deliveries until
  their secret is set.
- No fixed default admin password or signing key; login rate limits count
  failed attempts only and cannot be reset with a forged `X-Forwarded-For`.
