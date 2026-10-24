# Dashboard repair upgrade and acceptance

Status: unreleased source changes. This document does not confirm a deployment,
real-client OAuth connection, email-routing cutover or iPhone acceptance.

## Apply safely

Back up the SQLite database, media, retained private email originals, the instance
secret and current deployment environment before upgrading. Apply all three new
migrations through `prisma migrate deploy`; never use `db push`:

- `20261024010000_audit_workflow_repairs`: typed campaign sender IDs, skip reasons,
  personal notification reads and the opt-in MCP authorization ledger.
- `20261024020000_inbound_email_receipts`: receipt identity and processing history.
- `20261024030000_workspace_member_assignment`: provider-scoped assignment snapshots.

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

Notifications use committed activity IDs and per-person read state. The new
Activity view paginates recorded events; it cannot reconstruct historical actions
that were never logged. A background failure keeps loaded results visibly stale
rather than treating it as a successful empty result.

## Features that remain off until accepted

- `MCP_AUTH_MODE=legacy` is unchanged by default. Follow
  [personal authorization](mcp-personal-authorization.md) before opting into the
  administrator-only, read-only mode. Real Clerk, ChatGPT and Codex consent,
  proxy, restart and rollback checks remain required. Personal message sending
  and campaign management are not implemented by this read-only grant.
- `EMAIL_INGRESS_ENABLED=false` and the Cloudflare adapter's relay flag remain off.
  Follow [inbound email setup](inbound-email-receiver.md). No MX change, cloud
  resource creation, new spending or removal of the Gmail/IMAP path is automatic.
- Keep the free email sign-in path. Google sign-in and Gmail/Outlook OAuth mailbox
  connectors still need their own implementation/configuration and acceptance.
  Passkeys remain deferred. Production Clerk cutover is tracked separately in #19.

## Release acceptance

Automated checks cover the real migration chain, SQLite-backed route fixtures,
API permissions, parsers, retries, personal authorization and delivery contracts.
Also run dashboard lint, typecheck, regular/demo builds, Home Screen asset checks,
MCP tests and repository hygiene. A normal build is not a production identity check;
`build:production` must still pass its live-Clerk environment gate.

Before production promotion, review the actual desktop and iPhone 13 flows:
normal sign-in, navigation/safe areas, keyboard, conversation reload, closed WhatsApp
window, visible failures, drafts, automatic updates, device notification permission,
background push and notification tap into the correct sender's conversation.
Source tests and sample screenshots cannot substitute for this device check.

No customer send or campaign launch is needed to validate database upgrades.
Use owned addresses/numbers only for the separately reviewed provider acceptance.

## Local verification record

- 325 unit/fixture checks passed; four pre-existing TODO cases remain.
- 127 API integration checks passed against the full SQLite migration chain.
- 16 MCP transport/OAuth checks passed.
- Dashboard lint, typecheck, normal and demo builds passed; Home Screen PNG/manifest checks passed.
- Migrating an empty database then comparing it to the Prisma schema produced an empty migration.
- Private encrypted MIME backup/extraction/decryption was exercised on a throwaway fixture.

These checks did not use production data or contact customer providers. Bundle-size
warnings remain; actual browser and iPhone checks are still outstanding.
