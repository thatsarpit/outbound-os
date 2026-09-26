# Security Policy

## Reporting a vulnerability

**Please do not open a public issue.**

Report privately through
[GitHub's private vulnerability reporting](https://docs.github.com/en/code-security/security-advisories/guidance-on-reporting-and-writing-information-about-vulnerabilities/privately-reporting-a-security-vulnerability)
on this repository, or email **security@outboundos.space**.

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
- **Outbound sending credentials** — WhatsApp Business API and email provider
  keys, encrypted at rest but decryptable by the running application
- **The ability to message people on your behalf** — a compromised instance can
  send to your entire contact list under your identity, which is often more
  damaging than the data exposure itself

Issues involving any of the above are treated as high severity by default.

## For self-hosters

Most real-world incidents with software like this are configuration, not code:

- **Never commit `.env`.** It is gitignored; keep it that way.
- **Rotate `LEAD_SYNC_ENCRYPTION_KEY` deliberately.** It decrypts stored channel
  credentials. Rotating it without re-encrypting makes every stored integration
  unreadable.
- **Put it behind TLS.** The dashboard and API carry session tokens.
- **Set `WEBHOOK_INGEST_SECRET`.** An unsigned lead-ingest endpoint lets anyone
  who learns the URL inject leads into your pipeline — and therefore cause your
  instance to message people of their choosing.
- **Restrict database access.** SQLite means a readable file is a readable CRM.

## Out of scope

- Vulnerabilities in third-party services (Meta, Brevo, Clerk) — report those
  to the vendor
- Findings from automated scanners with no demonstrated impact
- Missing hardening headers on a self-hosted deployment you control
- Social engineering of maintainers or users
