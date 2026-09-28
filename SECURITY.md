# Security Policy

## Reporting a vulnerability

**Please do not open a public issue.**

Report privately through
[GitHub's private vulnerability reporting](https://github.com/thatsarpit/outbound-os/security/advisories/new)
on this repository.

Please include what you were doing, what happened, and how to reproduce it.
A proof of concept helps but is not required to report something.

**What to expect:** acknowledgement within 3 working days, and an assessment
with a fix timeline within 10. This is a small project — if a fix will take
longer than that, you'll be told so rather than left waiting.

You'll be credited in the advisory unless you'd rather not be.

## Supported versions

Only the latest release on `main` receives security fixes. There are no
long-term support branches yet.

## What this software handles

Understanding the blast radius helps when judging severity:

- **Customer contact data** — names, phone numbers, email addresses, and full
  message history, stored in your database
- **Outbound sending credentials** — WhatsApp and email provider keys,
  encrypted at rest but decryptable by the running application
- **The ability to message people on your behalf** — a compromised instance can
  send to your entire contact list under your identity, which is often more
  damaging than the data exposure itself

Issues involving any of the above are treated as high severity by default.

## For self-hosters

Most real-world incidents with software like this are configuration, not code:

- **Never commit `.env`**, and keep backups private. It is gitignored; keep it
  that way.
- **Back up `instance-secrets.json` with the database.** It holds the keys that
  sign sessions and encrypt stored credentials. Anyone with both files has
  your CRM; lose the secrets file and saved credentials cannot be decrypted.
- **Put it behind HTTPS.** The dashboard and API carry session tokens.
- **Treat each lead-source key as semi-public.** A key embedded in a website
  form can be read by anyone, and lets them submit leads to that source — and
  so trigger first-touch messages to numbers of their choosing. Rotate a key
  that is abused, and use the `_gotcha` spam trap on public forms.
- **Set the webhook secrets** for the channels you use: `META_APP_SECRET`,
  `AISENSY_WEBHOOK_SECRET`, `IMESSAGE_WEBHOOK_SECRET`, `BREVO_WEBHOOK_SECRET`.
  Each provider webhook rejects every delivery until its secret is set.
- **Set `TRUST_PROXY` correctly** if you run behind a CDN, so login rate
  limits see the real client address.
- **Restrict database access.** SQLite means a readable file is a readable CRM.

## Out of scope

- Vulnerabilities in third-party services (Meta, AiSensy, Brevo, Clerk) —
  report those to the vendor
- Findings from automated scanners with no demonstrated impact
- Missing hardening headers on a self-hosted deployment you control
- Social engineering of maintainers or users
