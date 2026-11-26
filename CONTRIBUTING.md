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

## Versioning a release

`VERSION` is the public product version for the dashboard and server. When
promoting a new revision to production, bump `VERSION` and add the matching
changelog entry. Use a patch for fixes and compatible polish, a minor for
features, and a major for a new incompatible release. Tag the reviewed commit
with the matching name, such as `v0.5.1` for `VERSION=0.5.1`. The Docker release
workflow checks the version against existing tags, and the production dashboard
deploy command verifies the tagged source and the built asset. Builds from
untagged commits display a development build and its source revision.

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
