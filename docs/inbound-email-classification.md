# Inbound email classification

IMAP ingestion classifies matched mail before treating it as a customer reply.
`Message.emailInboundKind` records `human`, `delivery_report`, `automatic_reply`
or `pending`. Null remains the legacy value; historical messages have not been
silently reclassified.

Delivery reports use MIME `message/delivery-status` or `multipart/report` with
`report-type=delivery-status`. Other MIME reports, `Auto-Submitted` values other
than `no`, and explicit responder headers identify automatic mail. A narrow
fallback recognizes direct subject prefixes such as `Automatic reply:` or
`Out of office:`. A forwarded/replied subject, quoted body or casual mention of
being away does not establish automation. This is a deterministic classifier,
not proof of a message's human origin; unmarked or unusual responders can still
need review.

Both desktop and mobile retain these messages in conversation history with a
clear label. Customer reply counts, overview/charts, daily reports, email
template reply credit, lead scoring and priority/SLA triage use the same
human-reply definition. The activity feed excludes machine mail before its
pagination limit. An automatic message neither raises the customer-reply
notification nor changes the lead to replied/engaged. It also cannot remove an
older unanswered customer message from Needs Reply.

The composer chooses the latest customer or outbound email as its reply
parent, excluding automatic reports and pending downloads. Sends without an
SMTP Message-ID use a new email instead of an invalid thread target. This does
not change provider-marketing reply attribution or shared-inbox sender routing.

## Partial downloads and replay

When a matched message cannot be downloaded, its pending row remains visible,
its sync cursor stays behind the failure, and existing queued outreach is
cancelled conservatively. Pending mail is not counted as a human reply. After
the body is recovered, classification and human-reply state changes commit in
one transaction. `emailReplyProcessedAt` prevents a recovered body from creating
a second engagement event. Message identity is checked again inside that
transaction to protect overlapping inbox imports.
Legacy partial rows already ran those side effects under the old importer;
their body recovery preserves that processed state instead of notifying again.

Mail with a Message-ID deduplicates by that ID. Without one, the importer uses
an internal key derived from mailbox identity, UIDVALIDITY, UID, original date
and header fingerprint; it does not invent an SMTP threading ID. IMAP internal
receipt time is retained as `providerCreatedAt`, falling back to the envelope
date and then ingestion time when no receipt time is available.

Human mail cancels queued outreach even for a lead already paused/closed, and
does not clear an existing opt-out or suppressed address. Cancelled messages
are not automatically restored if an incomplete download later proves to be
automatic. Review any such pending work deliberately.

## Rollout and limitations

Apply `20261016010000_email_reply_classification` before starting the new API.
It adds two nullable columns without changing historical rows. Back up the
database first, deploy compatible frontend/API versions and verify a real owned
mailbox's human, vacation and delivery-report examples before acceptance. This
test must not use outreach recipients as smoke-test targets.

Retain the new columns and their data during rollback. An older API counts all
matched mail as replies, so suspend inbox polling during a rollback until the
fixed importer is restored and affected messages can be reconciled.

Historical rows with null classification retain the previous human-reply
interpretation, except incomplete `partial` email rows. Repairing old DSNs,
derived lead states, scores and old reply notifications requires original MIME
evidence and a separate reviewed backfill. The importer still matches existing
leads using the existing thread/address routing; unthreaded mail from an unknown
postmaster is not assigned to a customer by guessing a recipient from prose.
Parsing DSN recipient blocks into delivery state is also separate from the
provider receipt ledger. Notification persistence itself remains best effort
after the human-state transaction; the durable notification lifecycle is a
separate audit repair.

Format references: [RFC 3464](https://www.rfc-editor.org/rfc/rfc3464),
[RFC 3834](https://www.rfc-editor.org/rfc/rfc3834).
