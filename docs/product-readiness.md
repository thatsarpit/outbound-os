# Product readiness review — 11 November 2026

This is a source and operations review, not an enterprise certification or a
penetration test. Implemented, tested, released and deployed are distinct states.
The starting repository baseline is main `a2f182f`; the maintenance branch
contains another 14 commits, ending at `b8eb0d1`, before this review's changes.
Do not replace production with main until those runtime changes and database
migrations have been reconciled through reviewed PRs.

## Current GitHub work

Five open issues were inspected: [#31](https://github.com/thatsarpit/outbound-os/issues/31)
(repair programme), [#19](https://github.com/thatsarpit/outbound-os/issues/19)
(team/device auth acceptance), [#3](https://github.com/thatsarpit/outbound-os/issues/3)
(Nginx installation acceptance), [#4](https://github.com/thatsarpit/outbound-os/issues/4)
(form setup guides), and [#12](https://github.com/thatsarpit/outbound-os/issues/12)
(form presets). There are also 14 open PRs. Link work to the existing repair
programme rather than starting a competing backlog.

Main has seven required checks, enforced for administrators, with force pushes
and deletion disabled. Latest-main checks inspected during this review passed.
Two dependency advisories remain open; existing update PRs
[#73](https://github.com/thatsarpit/outbound-os/pull/73) and
[#75](https://github.com/thatsarpit/outbound-os/pull/75) have passing checks.
Review compatibility and merge through protection before publishing patched
images. One open CodeQL finding requires manual triage; do not assume either
exploitability or a false positive from a scanner label alone. No open secret
scanning alerts were returned. These are time-specific observations, not a
promise of complete vulnerability coverage.

## Confirmed fixes in this change

- Preflight incorrectly required Clerk for the default local-auth install.
  Select requirements using the same provider rule as runtime; reject missing
  Clerk key pairs and invalid provider names. CI now checks the shipped example.
- Example WhatsApp rate variables did not match the variables read by config.
  Document actual daily, hourly and initial-contact defaults and sending hours.
  This corrects configuration documentation; it does not add dispatch limits.
- Installation instructions now distinguish source builds from pulled images,
  describe architecture/Windows prerequisites and port exposure, and include
  secrets preservation and upgrade/restore boundaries.

## Build next, in dependency order

| Priority | Work | Acceptance evidence |
| --- | --- | --- |
| P0 | Reconcile deployed maintenance changes, existing PRs and release manifest | API, MCP, frontend and migration revisions recorded together; upgrade and rollback rehearsed |
| P0 | Merge reviewed dependency fixes; triage the open code-scanning finding privately | Required checks pass; published images contain patched lockfiles; alerts resolved with evidence |
| P0 | Correct provider failure taxonomy | Insufficient balance is reported as billing, not authentication; country restrictions are distinguished from retryable marketing limits |
| P1 | Durable campaign scheduler | User can schedule/cancel/reschedule from UI and MCP; future status alone never implies an active worker; database-backed due-work claim survives restart without duplicate sends |
| P1 | Recipient time zones and dispatch pacing | Use explicit IANA zones, DST and weekday windows; ambiguous country-only locations are held or reviewed; apply workspace hours too; hourly/daily limits enforced even with explicit senders |
| P1 | Audience and spend controls | Exact audience snapshot, deduplication, prior-contact rules and reason counts before launch; recheck replies/opt-outs per send; estimate by country/category and stop on budget/provider refusal |
| P1 | Queue recovery and operations console | Visible queued/accepted/delivered/read/failed/unknown states, last worker run, webhook freshness, reviewed retries and dead letters; provider acceptance never presented as delivery |
| P1 | Reproducible self-host installation | Fresh and upgrade CI on amd64/arm64; Docker-only local auth; optional Clerk/MCP; Linux proxy and Windows/WSL acceptance; actionable readiness errors |
| P1 | Restore and incident readiness | Off-host encrypted backup with DB, keys, media and originals; measured restore drill; alerts for failed backup, disk, worker lag and billing exhaustion |
| P2 | Team security | Verify invitations/revocation, immediate live-stream permission revocation, scoped/revocable MCP grants, audit trail and recovery; physical-device acceptance remains explicit |
| P2 | Business integration features | OAuth mailbox connectors, reliable event subscriptions, import identity/provenance review and webhook replay; complete existing forms issues |
| P3 | Larger-firm architecture | Capacity tests, durable workers and database migration plan; real tenant isolation before any multi-tenant claim; retention/export/deletion policy, SSO and granular roles as separately tested capabilities |

## Scheduler implementation boundary

The current campaign engine checks workspace business hours at launch and
dispatch. A `scheduledAt` column exists, but no due-campaign worker or schedule
API was found in `src/index.js` or the campaign MCP tools. A time-window check
is not a scheduler. Do not mark a campaign scheduled by writing the column alone.

The first scheduler release needs transactional claims, durable execution
identity, explicit cancellation and overdue-run policy, per-recipient next-send
times and tests for restart/concurrent workers, DST, pauses, replies, suppression
and unknown provider outcomes. It must not widen audiences or automatically
replay accepted/uncertain submissions.

The explicit-sender campaign template path currently updates counters without
enforcing daily/hourly limits at that dispatch boundary. Its per-recipient
delay is approximately 1–3 seconds. Scheduler work must address that path;
changing documented account defaults alone cannot provide reliable pacing.

## Validation limits

On the main-based installation branch, 372 unit/fixture tests passed with four
existing TODOs, and 146 isolated-database integration tests passed. Repository
hygiene, whitespace checks and preflight against `.env.example` passed.

Physical phone acceptance, external-provider delivery, cloud-firewall rules,
backup decryptability and restoration require separate evidence. A healthy
container or green CI run does not prove those outcomes. The local Docker
daemon was unavailable during this review, so a new image boot was not verified.
No installation is claimed tested on Windows merely because WSL instructions
are supplied. Capacity claims require realistic load tests, not extrapolation
from small campaigns.
