# Troubleshooting

## The app will not start

- `docker compose logs app` shows the reason. A migration error names the
  migration and the table.
- Manual installs: Node.js 24 or newer (`node --version`), then `npm ci` and
  `npx prisma migrate deploy`.
- `npm run preflight -- .env` reports configuration mistakes.

## I don't know the admin password

- If you never set `ADMIN_PASSWORD`, the first boot printed one:
  `docker compose logs app | grep "First admin"`.
- Otherwise reset it on the server (it asks for the new password, so it never
  lands in shell history):

  ```bash
  docker compose exec app npm run reset-password -- admin@example.com
  ```

## Sign-in fails with "Email or password is incorrect"

- Emails are matched case-insensitively; check for a typo.
- After five failed attempts in a minute, sign-in is paused for a minute.

## Saved channel credentials stopped working after a restore

The database was restored without its `instance-secrets.json` (or with a
different `LEAD_SYNC_ENCRYPTION_KEY`). Restore the matching secrets file, or
re-enter the credentials in Settings.

## WhatsApp replies do not arrive

- The webhook must be HTTPS on a public hostname.
- `META_APP_SECRET` must be set, or every Meta delivery is rejected (the log
  says so).
- In Meta, the **messages** field must be subscribed for the app.

## Leads from a website form arrive without details

Open Integrations → Webhooks and check the source's field map against the
names your form actually posts (`name`, `phone`, `email`, …).

## Using Clerk instead of built-in sign-in

Set `AUTH_PROVIDER=clerk`, `CLERK_SECRET_KEY` and `CLERK_PUBLISHABLE_KEY` from
the same Clerk instance, and make sure users belong to an organization with a
role. Local builds may use `pk_test_`/`sk_test_` keys.
