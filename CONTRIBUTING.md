# Contributing

Thanks for helping. Keep changes scoped, and explain the *why* in the pull
request — the diff shows the what.

## Before you open a pull request

```bash
npm ci && npm ci --prefix web
npm test
npm run test:integration
npm run lint --prefix web
npm run typecheck --prefix web
npm run build --prefix web
```

CI runs the same checks.

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
