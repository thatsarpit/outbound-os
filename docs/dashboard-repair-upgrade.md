# Dashboard repair upgrade and acceptance

Status: release 0.4.0 is deployed on 25 October 2026. #53 and #63 are merged;
the production API/MCP images and dashboard include `e5db03d`, retaining the
inbound-email reader and verified downloads from #57. Production owner login,
Google linking, authenticated API reads and the signed live-update stream were
verified. Personal MCP activation, all-alias mail cutover and full physical
iPhone Safari/Home Screen acceptance remain open.

## Apply safely

Back up the SQLite database, media, retained private email originals, the instance
secret and current deployment environment before upgrading. Apply every pending
migration through `prisma migrate deploy`; never use `db push`. The recent chain
contains:

- `20261024010000_audit_workflow_repairs`: typed campaign sender IDs, skip reasons,
  personal notification reads and the opt-in MCP authorization ledger.
- `20261024020000_inbound_email_receipts`: receipt identity and processing history.
- `20261024030000_workspace_member_assignment`: provider-scoped assignment snapshots.

The inbound-email receipt migration shipped before the broader dashboard repairs.
The audit workflow and workspace assignment migrations are the two additions in
#53 relative to `cc53e72`. All 17 migrations are in the released chain.

Existing local user assignments and message history are preserved. Clerk assignment
requires the installation's existing `CLERK_ORGANIZATION_ID` to be pinned in production.
It never maps a Clerk member to a local account by matching their email.

`scripts/backup.sh` creates a companion `.inbound-mail.tar.gz` whenever private MIME
objects exist, and prunes it with its matching database backup. Copy both off-host.
Store the instance encryption secret separately; without it retained MIME cannot
be decrypted. Rehearse restoring the data and secret before changing mail routing.

## Intentional contract changes

Money amounts remain in stored minor units. Orders and Customers expose totals by
currency. Legacy scalar sums are `null` when multiple currencies are present;
clients must never treat this as a combined zero or apply a preferred currency.
Product performance also separates the stored order unit. Revenue order totals
use order creation dates; invoiced, recorded-paid and outstanding balances are
explicitly lifetime figures because payment-event history is not yet available.

New assignments use `memberKey`. Existing numeric `userId` remains supported for
local sign-in, with strict validation. An explicit `null` clears both assignment
fields. Agents can atomically claim unassigned work or their own work; a manager
must reassign another person's lead. Tasks `scope=mine` means tasks on that
person's assigned leads, not a separate task-owner field.

Trusted legacy MCP administrators can discover explicit provider-scoped targets
with `list_users` and assign through `lead_assign.member_key`; an explicit null
unassigns. They cannot use personal self-claim. Local installations retain
numeric `user_id` compatibility; Clerk installations require a current member
key from the pinned organization and never map accounts by matching emails.

Notifications use committed activity IDs and per-person read state. The new
Activity view paginates recorded events; it cannot reconstruct historical actions
that were never logged. A background failure keeps loaded results visibly stale
rather than treating it as a successful empty result.

## Configuration and acceptance boundaries

- `MCP_AUTH_MODE=legacy` is unchanged by default. Follow
  [personal authorization](mcp-personal-authorization.md) before opting into the
  administrator-only, read-only mode. Real Clerk, ChatGPT and Codex consent,
  proxy, restart and rollback checks remain required. Personal message sending
  and campaign management are not implemented by this read-only grant.
- Ingress and relay flags default off for new installations. The existing
  private KV/Queues pilot is enabled for one owned test alias; customer sender
  aliases still forward to Gmail/IMAP. Follow
  [inbound email setup](inbound-email-receiver.md) before any broader cutover.
  Storage monitoring, retention, recovery and all-address routing acceptance
  remain open. Verified forced downloads do not provide malware scanning.
- Production Clerk owner login and Google account linking were verified while
  retaining email sign-in and visible Clerk branding. Google sign-in does not
  connect a Gmail inbox: Gmail/Outlook OAuth mailbox connectors remain separate
  work. Passkeys remain deferred. See the
  [production cutover record](clerk-production-cutover.md).

## Release acceptance

Automated checks cover the real migration chain, SQLite-backed route fixtures,
API permissions, parsers, retries, personal authorization and delivery contracts.
Also run dashboard lint, typecheck, regular/demo builds, Home Screen asset checks,
MCP tests and repository hygiene. A normal build is not a production identity check;
`build:production` must still pass its live-Clerk environment gate.

The production release verified owner sign-in, authenticated reads and the signed
live-update stream. Full physical iPhone 13 Safari/Home Screen acceptance still
needs navigation/safe areas, keyboard, conversation reload, closed WhatsApp window,
visible failures, drafts, automatic updates, device notification permission,
background push and notification tap into the correct sender's conversation.
Source tests, desktop browser checks and sample screenshots cannot substitute
for this device check.

No customer send or campaign launch is needed to validate database upgrades.
Use owned addresses/numbers only for the separately reviewed provider acceptance.

## Local verification record

- Release source on 25 October 2026: 355 unit/fixture checks passed; four pre-existing TODO cases remain.
- 131 API integration checks passed against the full SQLite migration chain.
- 20 MCP transport/OAuth/assignment checks passed.
- Dashboard lint, typecheck, normal/demo and strict production builds passed; Home Screen PNG/manifest checks passed.
- All 17 migrations applied to an empty fixture database; comparison to the Prisma schema produced an empty migration.
- Retained-mail tests verified exact attachment bytes, encrypted-original integrity failures, route permissions and forced-download headers. The earlier private MIME backup/extraction/decryption fixture remains recorded.

The automated checks used isolated fixtures. Bundle-size warnings remain.

## Deployment verification — 25 October 2026

- API and MCP images and the production Pages dashboard were released from the
  merged source. Existing notification state was transferred before startup;
  core record counts were preserved.
- Production owner sign-in, authenticated API reads and EventSource updates
  passed. Google sign-in linked to the existing owner rather than creating an
  unrelated workspace identity.
- The legacy MCP catalogue retained 36 tools. A read-only health tool, existing
  OAuth access, static bearer access and anonymous denial passed; personal mode
  was not enabled.
- Retained email text and exact attachment bytes passed authenticated checks.
  Forced downloads verify integrity; they do not scan for malware.

The release did not require a customer send or campaign launch. Full physical
iPhone acceptance and the configuration boundaries above remain open.
