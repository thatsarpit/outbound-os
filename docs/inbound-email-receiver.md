# Inbound email persistence and Cloudflare receiver

The shared ingestion service is implemented and used by the existing IMAP importer. The optional Cloudflare raw-MIME endpoint and Worker are **disabled until configured**. This source change does not enable a Worker, create cloud resources, change MX records, replace mailbox routing or send customer mail.

## What is implemented

- `src/services/inboundEmailIngestion.js` owns matching, classification, message persistence, queued-message cancellation, first-reply processing and persisted activity. IMAP and the optional Cloudflare endpoint use the same transaction path.
- Received text is retained in full. Successfully parsed HTML-only, attachment-only and empty-body messages are complete messages, not perpetual partial downloads. Received HTML is sanitized before persistence; scripts, styling, images, executable URL schemes and event handlers are removed.
- `InboundEmailReceipt` records provider identity, MIME hash, SMTP envelope, receiving account, resulting message, processing state, original timestamp and attachment metadata. Unknown senders, unknown receiving addresses, ambiguous matches and identity conflicts are retained for review rather than silently discarded. No unknown sender automatically creates a lead or triggers outreach.
- Original MIME, including attachment bytes, is stored under `private/inbound-email/` beside the database, outside public media. Objects are AES-256-GCM encrypted using a key derived from the existing backed-up instance encryption secret; file permissions are `0600` and directory permissions `0700`. Do not rotate or lose that instance secret without a migration.
- A partial IMAP download holds queued follow-ups while retaining a retryable receipt. The same receipt/message upgrades once after a successful download. Header-classified automatic messages and delivery reports stay visible without human-reply credit, notifications or cancellation of queued work.
- A complete matched human reply, its once-only reply state and its `ActivityLog` row commit in the same database transaction. `activityLog.publishPersisted()` publishes that committed activity; it does not create another database row.
- Repeat provider deliveries and overlapping IMAP/Cloudflare delivery deduplicate by receiving account and RFC Message-ID. Reused identities with conflicting content/envelopes are held or rejected rather than overwriting message history. RFC Message-ID is sender-supplied, not proof of sender authenticity.

## Optional raw endpoint

Mount `createEmailIngressRouter()` at `/api/webhooks/email-ingress` **before** general body parsers and dashboard API authentication. It has its own authenticated delivery contract; a browser cookie or dashboard bearer token is not accepted.

Backend configuration:

```dotenv
EMAIL_INGRESS_ENABLED=false
# Set securely on the VM and Worker only when preparing the controlled pilot.
# EMAIL_INGRESS_SECRET=<at-least-32-random-characters>
```

The endpoint accepts POST with `Content-Type: message/rfc822` or `application/octet-stream`, a nonempty raw MIME body up to 25 MiB, and these headers:

| Header | Value |
|---|---|
| `x-outboundos-email-timestamp` | Current Unix seconds; maximum five-minute clock skew |
| `x-outboundos-email-event-id` | Stable 16–100-character `[A-Za-z0-9_-]` producer delivery ID |
| `x-outboundos-email-from` | Unpadded base64url of the UTF-8 SMTP MAIL FROM; empty is allowed for a bounce |
| `x-outboundos-email-to` | Unpadded base64url of the UTF-8 SMTP RCPT TO; one recipient per delivery |
| `x-outboundos-email-received-at` | Original receipt time in UTC ISO format, including milliseconds |
| `x-outboundos-email-content-sha256` | Lowercase SHA-256 hex of the exact raw MIME body |
| `x-outboundos-email-signature` | `v1=` followed by lowercase HMAC-SHA256 hex |

The signed string is these six values separated by a single newline, without a trailing newline:

```text
timestamp
event-id
base64url-from
base64url-to
received-at
content-sha256
```

The key is `EMAIL_INGRESS_SECRET`. Envelope and MIME-hash authentication is checked before allocating the raw body; the digest is checked against the received bytes afterward. The receiver also limits request rate and concurrent MIME parsing. A busy receiver returns 503 with `Retry-After` and must be retried from the private original.

A successful response is JSON with `accepted: true`, numeric `receiptId`, processing `state` and `duplicate`. Acceptance means a durable receipt exists. It does **not** mean an unknown sender was assigned to a lead, a quarantined message became actionable, or an iPhone notification arrived. Only a matched human reply takes the normal customer-reply side effects.

Retry network failures/503 responses with the **same** event ID, envelope, original receipt time and body, but a fresh current authentication timestamp/signature. A new body under the same event identity returns 409. Do not log credentials, MIME, signatures or backend response bodies.

## Cloudflare adapter

See [`cloudflare/email-ingress/`](../cloudflare/email-ingress/README.md). It contains inactive R2 and private KV receiver variants, a Queue consumer, acknowledgement markers and bounded reconciliation. The KV variant targets a bounded Workers Free workload without an R2 billing subscription; limits and delayed visibility still require acceptance. The Worker has no public raw-mail HTTP endpoint and never sends customer mail.

## Operational work still required before live cutover

1. The administrator-only review API is included here. The **Integrations → Email → Inbound email review** UI remains in the separate dashboard PR #53; deploy and accept it before cutting over all customer aliases. Use that queue to inspect receipt metadata and retry retained mail. An unmatched, unlinked receipt can be explicitly associated with an existing lead and enabled receiving account. Linked messages cannot be reassigned; partial MIME waits for mailbox recovery. Original MIME paths, bytes and payload hashes are never returned to the browser. A human reply still runs the normal automation-stop and notification transaction. Conflicts remain held when identity checks cannot be resolved.
2. Implement authorized attachment retrieval/scanning and a received-HTML display policy. Attachment bytes exist in encrypted original MIME; metadata is persisted. Do not claim a safe attachment-download UI is present.
3. Set a storage quota, monitored retention policy and recovery procedure. This patch deliberately never purges the only recoverable copy. `scripts/backup.sh` now includes a companion archive of private encrypted MIME objects and prunes it with its database snapshot. Partial and recovered originals have immutable object names. Back up the corresponding instance encryption secret separately and rehearse restoring both archives; database-only copies cannot replay held mail.
4. Review receiving addresses and aliases. The strict receiver currently resolves an envelope recipient against enabled `EmailAccount.email` values. A separate `replies.example.test` address needs an explicit route-to-account mapping and Reply-To support before it can serve as a pilot alias; changing MX alone is insufficient.
5. Preserve an external route for owner sign-in codes, billing, account recovery and administrative mail. Login access must not depend on opening an already-authenticated CRM inbox.
6. Review Cloudflare R2, Queues and Worker plan entitlements, limits and costs; create private resources, configure object-create notifications, DLQ monitoring, secrets and TLS endpoint reachability. Nothing here promises unlimited free cloud processing.
7. Rehearse with owned addresses: long text, HTML-only, attachments, Bcc, unknown/duplicate contacts, machine mail, partial download recovery, replay/conflicts, VM outage, missed R2 event/reconciliation, old campaign replies and notification tap into the exact thread. Keep IMAP/old routing available until counts and threads reconcile.
8. Inspect messages that arrived before the routing cutover separately. Cloudflare cannot recover messages it never received, and this implementation makes no claim to recreate historical mail lost at a prior provider.

## Verification

```bash
node --test test/inboundEmailIngestion.test.js test/emailIngress.test.js test/cloudflareEmailRelay.test.js
RUST_LOG=debug node --test --test-name-pattern='IMAP MIME|Inbound email classification' test/integration.test.js
```

The focused tests cover full content, sanitization, attachment metadata, encrypted originals, unmatched/ambiguous routes, partial recovery, replay/identity conflicts, storage/publication failures, signed raw-body authentication, size/backpressure limits and Cloudflare relay recovery contracts. The existing IMAP classification tests must remain green. Local mocks and contract checks do not establish real Cloudflare/SMTP or iPhone acceptance.
