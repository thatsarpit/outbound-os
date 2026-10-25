# Continue development with Hermes

Checked against GitHub on 25 October 2026. The repository is
<https://github.com/thatsarpit/outbound-os>; use `main` for new development.
The released application baseline is `v0.4.0`, commit
`7448ac88b15fd0cd8d4ee764ed49b1deb326fd20`. Later documentation commits do not
mean the running application has been upgraded again.

## Start in a separate source checkout

```bash
git clone --branch main https://github.com/thatsarpit/outbound-os.git
cd outbound-os
git status --short --branch
git log -1 --oneline
```

Read `AGENTS.md`, this document, `docs/dashboard-repair-status.md` and the issue
being addressed before editing. Use Node.js 24, matching CI, and create a focused
feature branch from current main. GitHub credentials are needed to push, but not
to clone this public repository. Connect those credentials privately with the
minimum repository access needed.

For an isolated development environment:

```bash
npm ci
npm ci --prefix web
npm ci --prefix mcp-outboundos
npm ci --prefix website
npx prisma generate
npm run check:hygiene
npm test
npm run test:integration
npm test --prefix mcp-outboundos
npm run lint --prefix web
npm run typecheck --prefix web
npm run build --prefix web
npm run build:demo --prefix web
npm run build --prefix website
npm run check:export --prefix website
```

The integration command creates its own disposable test database. Do not point
development commands at the production database or copy production `.env` files
into the checkout. A fresh source clone contains no customer data, credentials,
notification registrations, media, OAuth state or runtime volumes. Keep those in
the existing private runtime and backup system. Do not launch a second production
Compose stack merely to start coding. Prefer CI-built images over compiling on
the production VM, where an earlier build caused memory pressure.

## Released state and evidence boundaries

The 0.4.0 operational record reports the API/MCP exact-commit images deployed on
AWS and the production dashboard on Cloudflare Pages. Production Clerk owner
sign-in, Google linking, authenticated API/SSE access, existing MCP credentials,
retained email/attachments and preserved notification registration were verified.
This handoff does not constitute a new VM inspection or a physical iPhone test.

At the GitHub audit, main's CI, CodeQL and image build passed; there were no open
pull requests or Dependabot alerts. Main requires Repository hygiene, API tests,
Dashboard, MCP transport, Website, Docker image boots and CodeQL. Checks apply to
administrators, and force pushes/deletion of main are blocked. Keep these rules.

See [release 0.4.0](releases/0.4.0.md), [Clerk status](clerk-production-cutover.md),
[inbox reliability](inbox-reliability.md) and [email receiver](inbound-email-receiver.md).
Do not repeat an already completed identity migration based on an old checklist.

## Work to continue

| Priority | Next work | Acceptance boundary |
| --- | --- | --- |
| 1 | iPhone daily-use acceptance; remaining identity/team acceptance in [#19](https://github.com/thatsarpit/outbound-os/issues/19) and [#31](https://github.com/thatsarpit/outbound-os/issues/31) | Owner verifies installed Home Screen login, background/locked push, exact notification tap, keyboard/rotation, draft recovery and delivery failures. Browser emulation alone is insufficient. |
| 2 | Complete customer-alias Cloudflare email intake | Only an owned test alias uses the private KV/Queues receiver. Customer aliases still use Gmail/IMAP. Verify retention/replay, quota/outage recovery, aliases/Reply-To and overlap deduplication before moving each customer address. R2 is not activated. |
| 3 | Hermes event-driven sales integration | Keep the existing read-only connection while designing a durable authenticated event receiver, replay/deduplication and approved action execution. MCP access alone is not an automatic incoming-message notification subscription. |
| 4 | Audit backlog in [#31](https://github.com/thatsarpit/outbound-os/issues/31) | Historical email/delivery repair, attribution, task/team acceptance, reporting definitions, campaign recovery/template parameters and remaining account/integration gaps. Use isolated regression fixtures and explicit before/after predicates. |
| 5 | Hosted forms [#4](https://github.com/thatsarpit/outbound-os/issues/4) / [#12](https://github.com/thatsarpit/outbound-os/issues/12), real Nginx installation [#3](https://github.com/thatsarpit/outbound-os/issues/3) | Implementations and contract/container tests exist. Record real hosted submissions and public-domain Certbot/proxy acceptance before closing. See `docs/validation/README.md`. |
| Later | Quotations, product catalogue and sales workflow | Keep confidential prices and customer/product source files outside this public repository. Define units, warehouse/currency and approval rules before enabling automated quotations. |

Google dashboard sign-in is not a Gmail mailbox connection. OAuth mailbox
connectors and production passkeys remain separate work; no paid feature is
enabled by this handoff. This installation is one shared workspace, not a
multi-tenant SaaS deployment.

## Hermes MCP boundary

The owner reports an existing read-only Hermes connection. The release retained
the legacy MCP authentication mode and its 36-tool catalogue. A client-side tool
allowlist is not proof that a shared legacy credential is read-only on the
server. Do not distribute that credential or silently broaden Hermes's tools.

Read [MCP setup](mcp-dashboard-setup.md) and
[personal authorization](mcp-personal-authorization.md). Personal mode is
implemented as opt-in administrator consent with read-only scope, but was not
activated in the recorded production release. Verify the actual runtime mode
privately before changing it. Preserve issued OAuth state and a rollback path.

For future message-triggered automation, specify a persisted event identity,
authenticated delivery, retry/backoff, dead-letter recovery and a read-only
reconciliation path. Keep inbound processing fast and durable; run agent work
asynchronously. Distinguish CRM persistence, provider acceptance and delivery.
Writes need explicit authorization, the existing reply/opt-out/24-hour-window
rules and caller-known retry identity. Do not use customer messages as smoke tests.

## Branch and local-draft reconciliation

These closed-PR branch names were reviewed for retirement, rather than merged
back over newer main:

| Closed work | Reviewed replacement |
| --- | --- |
| Consent analytics #17; security #42 and #43 | Integrated security/dependency release #44, followed by newer UI and authorization repairs |
| Meta/connector/website #45 and retired redirects #49 | Consolidated release #52, followed by website polish #54 |
| Dependency PRs #23 and #58 | Later coordinated dependency upgrades, including #44 and #65; main has newer security fixes |

The pre-cleanup branch heads were saved in a verified Git bundle outside the
public checkout. GitHub's closed PR history is retained. Squash merges mean a
branch can appear ahead even when its feature has been integrated; do not merge
it simply because `git cherry` reports commits.

An older Mac checkout has an uncommitted nine-file email draft on a stale main
baseline. Its source and binary diff were backed up privately, without changing
that checkout. Current main already contains Gmail-inbox connection/sync,
Brevo account folders/capacity and later email repairs. The stale draft also
contains unreconciled tenant-key changes: it is not a reviewed multi-tenant
implementation and must not be applied wholesale. New work starts from main.

## Working agreement

1. Use a focused issue and branch; preserve unrelated work.
2. Add committed migrations for schema changes; never use production `db push`.
3. Use synthetic contacts and isolated databases for tests. Keep secrets and
   customer/business exports out of commits, public issues and CI logs.
4. Run the required checks and address review findings before a normal PR merge.
   Do not bypass branch protection or force-push main.
5. For runtime changes, take and verify a private backup, rehearse upgrades, pull
   reviewed images, preserve authentication/OAuth/encryption state and document
   rollback. Source merge is not production deployment or physical acceptance.
6. Retain the existing paused marketing gates. This handoff authorizes no
   campaign launch, customer test message, blanket consent change, paid plan,
   DNS cutover or live credential replacement.

## Starter prompt for Hermes

> Continue development of https://github.com/thatsarpit/outbound-os from current
> main. Read AGENTS.md, docs/hermes-handoff.md and the relevant open GitHub issue.
> First report the current commit, clean/dirty state, deployed-versus-source
> boundaries and the next acceptance criterion. Work in a separate development
> checkout with Node 24 and isolated test data; use focused branches and PRs with
> the required CI checks. Keep the existing production runtime and read-only MCP
> connection intact. Never commit private credentials, customer data or pricing
> sheets, reset production volumes, or send customer messages as tests. Begin
> with the highest-priority unfinished item that can be completed with the
> available access, and record what still requires the owner's physical device
> or provider confirmation.
