# Development baseline

Updated 16 November 2026.

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
from the retained deployment patch. A fresh VM container/source inspection
still requires successful Tailscale SSH authorization.

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

Use Git ancestry to check the revisions above, then inspect the current diff
and the relevant release notes. The local Git history retains the pre-reconcile
checkpoint and the maintenance, main and website merges.

The dashboard development preview uses `/dev/shell`. Build and verify that
preview and the normal dashboard entry points after changing their shared
components. Installation, scheduler and public-repository release PRs still
need a reviewed rollout against the deployed API.

## Verification on November 16

The reconciled API suite passed 155 tests and the MCP suite passed 29 tests.
The main unit suite passed 426 tests with four existing TODOs, followed by the
two restored first-touch email checks. Both dashboard builds and lint passed.
Prisma reported an empty migration diff after applying the combined migrations
to a fresh database. All four public dependency lockfiles returned zero known
advisories in the final npm audit.

Browser checks covered the recovered overview labels and stacked bar chart,
active navigation, campaign audience preview, editing/review/back navigation,
draft creation, population, scheduling, rescheduling and cancellation at
desktop and phone widths. Test records and provider responses were synthetic.
