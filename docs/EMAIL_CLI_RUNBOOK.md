# Email CLI Runbook

Use the email CLI when you want sender accounts provisioned directly from the terminal instead of through the dashboard.

Recommended system-email approach:

- Use a dedicated subdomain such as `updates.example.com`.
- Verify that subdomain with your email provider (Resend, Brevo, SES…).
- Register the sender in this app and mark it as `--system`.

## Commands

List configured accounts:

```bash
npm run email:cli -- list
```

Show built-in provider presets:

```bash
npm run email:cli -- providers
```

Show the current preferred system sender:

```bash
npm run email:cli -- system
```

Create a domain inbox using the project domain default:

```bash
npm run email:create -- \
  --local-part hello \
  --provider resend \
  --smtp-user resend \
  --smtp-pass "$RESEND_API_KEY" \
  --sender-name "Outbound OS" \
  --system \
  --test
```

Create a custom-provider inbox:

```bash
npm run email:create -- \
  --email ops@example.com \
  --provider custom \
  --smtp-host smtp.example.com \
  --smtp-port 587 \
  --smtp-user ops@example.com \
  --smtp-pass "<smtp-password>" \
  --imap-host imap.example.com \
  --imap-port 993 \
  --imap-user ops@example.com \
  --imap-pass "<imap-password>" \
  --sender-name "Outbound OS Ops"
```

Dry-run a create command without writing to the database:

```bash
npm run email:create -- \
  --local-part sales \
  --provider zoho \
  --smtp-user sales@example.com \
  --smtp-pass "<app-password>" \
  --dry-run
```

Verify SMTP for an existing account:

```bash
npm run email:cli -- test --id 1
```

Set an existing account as the default sender for reports and other automated mail:

```bash
npm run email:cli -- system --id 1
```

Clear the preferred system sender:

```bash
npm run email:cli -- system --clear
```

Delete an account:

```bash
npm run email:cli -- delete --id 1
```

## Defaults

- `--local-part` builds against the current public site domain.
- `--system` marks the account as the preferred sender for reports, request-access notifications, and other `sendSystemEmail` traffic.
- If no signature is passed, the CLI generates one that links back to the project site URL.
- Public fallbacks come from `NEXT_PUBLIC_SITE_URL`, `NEXT_PUBLIC_APP_URL`, `NEXT_PUBLIC_CONTACT_EMAIL`, and `NEXT_PUBLIC_REQUEST_ACCESS_ENDPOINT`.
