# Dashboard repair progress — 24 October 2026

This is an implementation ledger, not a claim that every audit finding is resolved
or that these source changes are already in production. Website implementation
remains paused. Detailed investigation notes are retained privately in the workspace.

| Area | Implemented in this branch | Remaining acceptance or work |
| --- | --- | --- |
| Leads and imports | RFC CSV parsing, visible errors, duplicate counts, exact tags, no removed-pool requirement, cache invalidation, role-aware controls, affected bulk counts, account-scoped browser views | Email-only CSV/provenance preview, safe duplicate review/merge, server-synced views and complete import history |
| Campaigns | Audience preview, typed senders, retained template names/provider IDs, per-dispatch eligibility, skipped reasons, paging and whole-list summaries | General Meta language/parameter mapping, full email-template campaign rendering, interrupted campaign operator recovery and later template reorganization |
| Pipeline and Tasks | Complete stage counts/load-more, keyboard/touch stage changes, outside-path counts, desktop queue, Mine/Workspace ownership, workspace-time due filters | Actual desktop/mobile interaction acceptance and richer task handoff policies |
| Assignment | Live local/Clerk validation, provider-scoped identities, shared ownership UI, atomic self-claim, manager reassignment and legacy preservation | Live Clerk directory/role-change check on the configured installation |
| Notifications and activity | Durable read state and IDs, monotonic watermark, exact-thread links, coalesced hydration, paginated recorded Activity | Full notification history/count policy, broader historical audit coverage, real-device background push/tap acceptance |
| Account and device settings | Compact sections, real Clerk sessions/linked identities, device naming/revocation, truthful sign-in capability labels | Production Clerk migration, optional Google login, later passkey decision; no paid feature activated |
| Health and diagnostics | Permission-aware health widgets, stale/error states, separate sending/receiving checks, configured versus enabled labels | Recovery backlog/retry console, freshness on every aggregate, owned-address end-to-end validation |
| Sales reporting | Currency-separated orders/customers/revenue, historical product units, lifetime invoice labels, order/customer pagination | Payment-event/confirmation-date history, complete currency filtering and the later quotation workflow |
| MCP | Provider-grouped setup prompts, personal dashboard consent, read-only policy, inventory/revocation, durable rotation and actor audit | Production opt-in and real clients; write grants and broader role-scoped connections are separate work |
| Inbound email | Shared IMAP/Cloudflare ingestion, full text/sanitized HTML, private originals, idempotency, receipt review/reprocessing and companion backups | Live Cloudflare pilot, aliases/Reply-To, attachment retrieval/scanning, monitored quota/retention, recovery-domain routing and OAuth mailbox providers |

See [upgrade and acceptance](dashboard-repair-upgrade.md). The open audit repair
programme (#31) remains open for unfinished areas. No customer campaign, template
deletion, DNS cutover or live authentication migration is part of these tests.
