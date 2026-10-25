# Dashboard repair progress — 25 October 2026

Release 0.4.0 is deployed as of 25 October 2026, including the dashboard repairs
from #53, retained-mail reading/downloads from #57 and Clerk live-update/social
sign-in repairs from #63. The API/MCP images and production dashboard include
`7448ac8`, including the dependency security follow-up #65. This ledger keeps
unfinished audit work separate from that deployment;
detailed operational evidence remains private.

Production owner login, Google linking, authenticated API reads and the signed
live-update stream were verified. Existing notification state was carried forward
before startup and core record counts were preserved. Legacy MCP authentication,
its 36-tool catalogue and read-only health checks passed, including existing OAuth
and static credentials and anonymous denial. Personal MCP mode remains disabled.
The controlled private KV/Queues pilot remains limited to an owned test alias;
customer sender aliases still forward to Gmail/IMAP.

| Area | Released implementation | Remaining acceptance or work |
| --- | --- | --- |
| Leads and imports | RFC CSV parsing, visible errors, duplicate counts, exact tags, no removed-pool requirement, cache invalidation, role-aware controls, affected bulk counts, account-scoped browser views | Email-only CSV/provenance preview, safe duplicate review/merge, server-synced views and complete import history |
| Campaigns | Audience preview, typed senders, retained template names/provider IDs, per-dispatch eligibility, skipped reasons, paging and whole-list summaries | General Meta language/parameter mapping, full email-template campaign rendering, interrupted campaign operator recovery and later template reorganization |
| Pipeline and Tasks | Complete stage counts/load-more, keyboard/touch stage changes, outside-path counts, desktop queue, Mine/Workspace ownership, workspace-time due filters | Actual desktop/mobile interaction acceptance and richer task handoff policies |
| Assignment | Live local/Clerk validation, provider-scoped identities, shared ownership UI, atomic self-claim, manager reassignment and explicit validated legacy MCP assignment | Full real-team assignment/role-change acceptance on the configured installation |
| Notifications and activity | Durable read state and IDs, monotonic watermark, exact-thread links, coalesced hydration, paginated recorded Activity | Full notification history/count policy, broader historical audit coverage, real-device background push/tap acceptance |
| Account and device settings | Compact sections, real Clerk sessions/linked identities, device naming/revocation, truthful capability labels, verified production owner sign-in and Google linking | Full device-management acceptance and the separate passkey decision; no paid feature activated |
| Health and diagnostics | Permission-aware health widgets, stale/error states, separate sending/receiving checks, configured versus enabled labels | Recovery backlog/retry console, freshness on every aggregate, owned-address end-to-end validation |
| Sales reporting | Currency-separated orders/customers/revenue, historical product units, lifetime invoice labels, order/customer pagination | Payment-event/confirmation-date history, complete currency filtering and the later quotation workflow |
| MCP | Provider-grouped setup prompts, validated legacy assignment, retained issued credentials, personal-consent/read-only/rotation/audit implementation | Personal mode activation and real-client acceptance; write grants and broader role-scoped connections are separate work |
| Inbound email | Shared IMAP/Cloudflare ingestion, full text/sanitized HTML, encrypted originals, idempotency, receipt reading/reprocessing, verified forced-download attachments, companion backups and a controlled owned-alias pilot | All-address cutover, aliases/Reply-To, monitored storage/retention/recovery, malware scanning, OAuth mailbox providers and actual iPhone download/notification acceptance |

See [upgrade and acceptance](dashboard-repair-upgrade.md). The open audit repair
programme (#31) remains open for unfinished areas. Full physical iPhone Safari/Home
Screen acceptance, all-alias mail cutover, OAuth mailbox connections, passkeys and
personal MCP activation/writes are not completed by this release. Validation did
not require a customer campaign launch or customer message send.
