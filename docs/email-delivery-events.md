# Brevo delivery receipts

The authenticated `POST /webhook/brevo` endpoint (also exposed through
`/api/integrations/brevo`) accepts one email event or an array of up to 1,000.
Every fact and its local changes commit in one transaction before HTTP 200.
Invalid payloads receive 400, missing/invalid secrets receive 401, and transient
processing failures receive 503 so delivery can be retried.

Configure `BREVO_WEBHOOK_SECRET` and send it in `X-Brevo-Webhook-Secret` or a
Bearer header. The existing `?secret=` fallback remains supported; headers
avoid putting the secret in URLs and access logs.

## Matching and account scope

Marketing events match `camp_id` plus the normalized recipient. Transactional
events match `message-id` plus the normalized recipient, accepting SMTP IDs
with or without angle brackets. There is no latest-message or recipient-only
delivery fallback. New sends preserve `Message.emailRecipient`; legacy rows
without it can only use the lead's current email address.

Give each Brevo account's webhook a URL ending in `?accountId=<local-email-account-id>`.
If sender verification has recorded the same remote Brevo identity for several
local senders, they share that scope. Otherwise the ID restricts matching to
that exact local sender. Unscoped legacy callbacks match only a unique local
message across Brevo senders. Ambiguous matches remain in the ledger for review;
configure account scope before production acceptance, since campaign IDs are
not globally unique across Brevo accounts.

The provider's `id` identifies a webhook registration, not an individual event.
Replay keys therefore bind account scope, recipient, campaign/message ID,
normalized event, UTC occurrence time and the clicked URL's digest input.
The URL itself, raw payload, subject, body and credentials are not stored.
`ts_event`, then `ts`, supply occurrence time; local date strings and the
transactional send-time `ts_epoch` are not used to order delivery facts.

## Delivery and suppression

`Message.status = sent` records acceptance, not delivery proof. Temporary
`soft_bounce`/`deferred` events preserve that acceptance and set the separate
`providerDeliveryStatus`. Both desktop and mobile show a temporary delivery
warning. They do not bounce the lead or enter an SMTP retry queue.

Delivered, tracked open and click receipts advance the message state. Older
events and lower delivery states cannot undo stronger evidence. Proxy opens
remain separate ledger facts and do not become tracked recipient opens.
Hard bounce, invalid recipient, blocked and error events record terminal
message failures; only hard bounce/invalid recipient suppress the address as
bounced. A sender/policy block does not declare a recipient address invalid.
Accepted messages with a subsequent provider failure remain in inbox history.
Marketing campaigns cannot be requeued through the SMTP retry API or worker.

Marketing `unsubscribe`, transactional `unsubscribed`, spam and complaint
events opt out every existing local lead sharing that normalized address,
record the first opt-out time and cancel queued email. Complaint status is
preserved if an unsubscribe arrives later. Delivery events never clear an
opt-out or automatically restore a previously suppressed address.

## Durable reconciliation and rollout

`EmailDeliveryEvent` stores applied, recorded, unmatched and unsupported facts.
Runtime maintenance revisits up to 100 unmatched identifiable events, oldest
attempt first, so an early callback can attach after local send recording.
This processes existing receipts; it does not contact Brevo or send email.
Changed/deleted account scopes are held for operator review.

Deploy the additive migration `20261016000000_email_delivery_events` before
starting the new API. It leaves historical message outcomes unchanged. Verify
the endpoint and scoped provider registrations with owned test recipients,
then compare provider activity with the ledger and inbox. Back up the database
before deploying; do not delete the ledger or new columns during a rollback.
An older API has the unsafe recipient-wide handler, so a rollback also needs
callback handling paused/held at the proxy and a later provider reconciliation.

This change does not reconstruct missed historical callbacks, repair existing
soft-bounce suppression, classify delivery-status emails in IMAP, or change
analytics denominators. Those remain separate audit repairs. The ledger is
operational data, accessible through database administration; a dashboard for
unmatched receipts and a provider-history backfill remain follow-up work.

Payload contracts: [Brevo marketing webhooks](https://developers.brevo.com/docs/marketing-webhooks)
and [transactional webhooks](https://developers.brevo.com/docs/transactional-webhooks).
