# Development baseline

Updated 26 November 2026.

## Current release and candidate

The live release baseline is **v0.5.2** at `b5fc874`. Start new work from
that release or a verified newer main revision. The v0.6.0 candidate adds
optional private Sales access, source assignment and Browser chat. Use the
[rollout guide](private-sales-and-browser-chat.md) before enabling either
feature. The November 16 release reconciliation below is historical.

## Live release checkpoint

PR #94 consolidates the release. The production API and MCP images are
`outbound-os:reconciled-a18a3e6` and `outbound-os-mcp:reconciled-a18a3e6`.
The dashboard deployment is `e8db0156` and serves `index-CyuSjJKV.js`; its
frontend source is unchanged by the later MCP packaging and CI fixes.
Both services are healthy. Authentication guards return 401 without a session.
All 24 database migrations are applied; the live schema diff is empty and
integrity/foreign-key checks pass. The private watcher remains healthy.

The first rollout exposed an MCP shared-module ownership issue and automatically
restored the previous images. The corrected image passed isolated non-root boot,
health and authentication checks before promotion. CI now repeats that test
using restrictive file permissions from a release archive. Private rollback
images, configuration and online database snapshots remain on the deployment
host; no customer records or credentials belong in this document.

The owner approved documenting the two intentional attachment-storage alerts
as reviewed false positives. Exact provider origins, size/type limits, generated
private paths and authenticated retrieval were independently reviewed.
Security scanning remains enabled.


The scheduler draft originally branched from `a2f182f` and omitted the maintenance
branch deployed afterward. This checkout reconciles the following sources.

| Source | Revision | Reconciled work |
| --- | --- | --- |
| Deployed maintenance source | `b8eb0d1` and its 13 preceding maintenance commits | Correct overview and analytics, channel receipts and suppression, campaign metrics, mobile conversations, quotes/reactions, push notifications and intake |
| Installation and scheduler drafts | `973c3e9`, `99a4f0e` | Default installation checks, one-time scheduling, cancellation and restart handling |
| GitHub main | `4ebd445` | Checked website release workflow and rollback evidence |
| Published website source | `8719a39` | SEO metadata, integration guide and isolated build checks |
| November 15 intake deployment patch | Source patch retained by the deployment owner | Intake status, exact-page validation, fresh-enquiry email renderer and regression coverage |
| Local development checkpoint | `3f75e5a` | Campaign review and scheduling preview, header-authenticated notifications, webhook destination controls, attachment protections and dependency updates |

## Evidence and verification boundaries

The November 5 release manifest records the dashboard source as `b8eb0d1`.
The public dashboard bundle checked on November 16 uses
`overview-B3LwefgX.js` and contains the corrected confirmed-message,
refresh-time and pipeline labels. The local overview source matches the
recorded maintenance revision before further edits.

The November 15 deployment notes record the API image
`outbound-os:indiamart-bridge-20261115-r2`. Its source changes are reconciled
from the retained deployment patch. A fresh VM inspection on November 16 confirmed this running API image and
healthy API, MCP and private watcher containers.

All preview records are synthetic. Runtime settings, private watcher state,
customer databases and deployment credentials remain operator-owned artifacts.
The watcher source and historical scratch checkouts are retained separately.

## Work still in separate branches

PRs #67 and #68 contain an experimental Hermes shadow event bridge and its
handoff. Their distinct schema and runtime changes need their own integration
and acceptance work. The released direct Hermes/MCP operations already exist
in main and are included here.

Dependency branches remain independently reviewable. This checkout contains
the tested MCP and dashboard security updates from the current development work.

## Continue from this checkout

The local continuation branch is `codex/reconciled-frontend-20261116`.

Resume from main after PR #94 is merged. Main requires linear history, so the
release is squash-merged. The retained reconciliation branch and dated
checkpoint tag preserve the original maintenance and development ancestry.
Use that history for tracing older work, and compare source trees when checking
a squash commit against a deployment revision.

The dashboard development preview uses `/dev/shell`. Build and verify that
preview and the normal dashboard entry points after changing their shared
components. The installation, scheduler and maintenance stacks are incorporated
in PR #94. Treat the separate Hermes experiment and remaining dependency
upgrades as future work; do not silently import them into this baseline.

## Verification on November 16

The reconciled API suite passed 155 tests and the MCP suite passed 29 tests.
The final main unit suite passed 431 tests with four existing TODOs. Both dashboard builds and lint passed.
Prisma reported an empty migration diff after applying the combined migrations
to a fresh database. All four public dependency lockfiles returned zero known
advisories in the final npm audit.

Browser checks covered the recovered overview labels and stacked bar chart,
active navigation, campaign audience preview, editing/review/back navigation,
draft creation, population, scheduling, rescheduling and cancellation at
desktop and phone widths. Test records and provider responses were synthetic.

The production-backup rehearsal exposed legacy installation defaults on
WhatsApp accounts. The November 16 normalization migration preserves every
configured account value and changes only defaults for future rows. Its target
table exactly matches SQL generated solely from the public schema, without
production mounts or credentials. A regression checks account values and pool
references survive the migration and new accounts receive neutral defaults.
