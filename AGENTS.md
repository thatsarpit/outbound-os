# AGENTS.md

Guidance for AI coding agents (Claude Code, Cursor, Codex, Copilot) and for
people working with them on this repository. Humans: CONTRIBUTING.md has the
same rules in fewer words.

## What this is

Outbound OS is a self-hosted, open-source WhatsApp CRM and outreach platform.
Leads arrive by signed webhook (website forms, Facebook Lead Ads, IndiaMART,
Zapier, CSV), are contacted within seconds on WhatsApp, email, Telegram or
iMessage, and get follow-ups until they reply. It runs as one Docker Compose
app with a SQLite database. AGPL-3.0.

## Layout

| Path | What lives there |
|---|---|
| `src/api.js` | Express app: every HTTP route and webhook. Large; add new route groups under `src/routes/` instead |
| `src/routes/` | Route modules (sales, customers, products, settlement, telegram) |
| `src/services/` | Channels, schedulers and engines: `whatsappCloudApi.js`, `whatsapp.js`, `emailService.js`, `replyDetector.js`, `followup.js`, `campaignEngine.js`, `freshLeadOutreach.js` |
| `src/utils/` | Pure helpers with unit tests: `inboundLead.js` (webhook field mapping), `whatsappAddress.js`, `workspaceTime.js` |
| `src/domain/` | Lead state machine and tiers |
| `src/auth/` | Built-in sign-in (default) or Clerk; role checks |
| `prisma/` | `schema.prisma` and hand-written SQLite migrations |
| `web/` | React + Vite dashboard (TypeScript) |
| `mcp-outboundos/` | MCP server exposing CRM tools to AI clients |
| `website/` | outboundos.space (Next.js static export) |
| `android/` | Android companion app (Kotlin) |
| `test/` | `node:test` unit tests and an integration suite against a throwaway database |

## Commands

```bash
npm ci && npm ci --prefix web     # install
npx prisma migrate deploy         # create/upgrade data/outboundos.db
npm run dev                       # API on :3001 (restarts on change)
npm run dev --prefix web          # dashboard on :5173, proxies /api
npm test                          # unit tests
npm run test:integration          # API tests on a fresh database
npm run lint --prefix web && npm run typecheck --prefix web && npm run build --prefix web
```

The dashboard has a preview mode with sample data and no backend:
`/dev/shell` (fixtures live in `web/src/pages/dev-shell.tsx`).

Run the unit and integration suites before calling a change done. CI runs
them, lints and builds the dashboard and site, and boots the Docker image
from an untouched `.env.example`.

## Rules that are easy to break

- **Database changes need a migration.** Add `prisma/migrations/<timestamp>_<name>/migration.sql`
  (hand-written SQL is fine) and update `schema.prisma` to match. Check with
  `npx prisma migrate diff --from-url file:<db> --to-schema-datamodel prisma/schema.prisma --script`
  — it must print an empty migration. Never rely on `prisma db push`.
- **WhatsApp goes through official APIs only**: Meta's Cloud API or AiSensy.
  Never automate the WhatsApp or WhatsApp Business phone apps.
- **Leads can lack a phone number.** `Lead.mobile` is required and unique, so
  email-only leads and WhatsApp username users carry a `no-phone:` placeholder.
  Use `isSendableMobile()` before dialling and `whatsappAddress(lead)` to pick
  a number or a business-scoped user id.
- **Automation must stop** on reply, opt-out, pause or close. Opt-out phrases
  live in `src/services/replyClassifier.js` and are covered by tests.
- **Webhooks authenticate.** Lead sources check a per-source key with
  `secretsMatch` (constant time); provider webhooks verify signatures or a
  secret and reject when it is unset.
- **Secrets never enter the repository**: no `.env`, databases,
  `instance-secrets.json`, exports or real customer data. Tests use
  `example.test` addresses and obviously fake numbers.
- **Time is the workspace's time zone** (`src/utils/workspaceTime.js`), never
  the server's, and follow-ups for a lead use the lead's country.
- **Website claims must match the code.** Before stating on `website/` that
  the product does something, find where it does it. The MCP tool list on the
  site is checked against the server in CI.

## Style

- Comments explain why, in full sentences, next to the code they justify.
  Match the density of the surrounding file.
- Small, pure helpers in `src/utils/` with a unit test beat logic inlined in
  a route.
- User-facing text is plain English: say what happened and what to do next.

## Adding a lead source or channel

Read `docs/integrations.md`. In short: keep provider ids and timestamps, make
repeated deliveries idempotent, write the message row before sending, move
delivery state forward only, stop automation on reply, and surface failures.
