# Contributing

Thanks for helping. Keep changes scoped, and explain the *why* in the pull
request — the diff shows the what.

## Before you open a pull request

```bash
npm ci && npm ci --prefix web
npm run check:hygiene
npm test
npm run test:integration
npm run lint --prefix web
npm run typecheck --prefix web
npm run build --prefix web
```

CI runs the same checks, plus the website build and a fresh Docker boot. Use focused commits, preserve unrelated working changes, and update issue status with the verification performed. Do not close an issue whose stated acceptance checks remain unverified.

## Database changes

Add a migration under `prisma/migrations/` (hand-written SQL is fine; SQLite
has limits Prisma's generator works around by rebuilding tables). The
integration suite builds its database through `prisma migrate deploy`, so a
migration that cannot run from empty fails there. Never ship a change that
depends on `prisma db push`.

## New channels and lead sources

Read [docs/integrations.md](docs/integrations.md). In short: preserve provider
timestamps and ids, make repeated deliveries idempotent, stop automation on
reply or opt-out, and make failures visible.

## Never commit

`.env`, SQLite databases, `instance-secrets.json`, exports, backups, or real
customer data in fixtures. Use `example.com`/`example.test` addresses and
obviously fake numbers in tests.

## Review and cleanup

Keep generated bundles, logs, credential files and local databases out of Git.
`npm run check:hygiene` checks tracked paths in CI; it does not replace reviewing
content for secrets or real customer data. Use `.env.example` for documented
configuration and sanitized fixtures for provider payloads.

Prefer route modules under `src/routes/` over expanding `src/api.js`. Verify
permission boundaries, failure paths and state preservation alongside the
happy path. A successful CI result does not prove a provider connection or a
physical device was tested; document those limits in the pull request.
