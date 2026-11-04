# Campaign submission, delivery, and recovery repairs

This change follows the automation and reporting work in #31. It is stacked
on #86 to preserve the campaign readiness and WhatsApp recovery changes already
deployed from that branch. It does not close the broader repair programme.

## Behavior

- Campaign filters reject unsupported fields. `limit` accepts an integer from
  1 to 10000, applies after eligibility checks, and cannot be exceeded by
  repeated population. Existing populated recipients are retained rather than
  silently replaced when their eligibility changes.
- Explicit provider marketing opt-outs are read from
  durable message/receipt evidence, scoped to the sending account. A later
  delivery event cannot erase that evidence. Preview, dispatch, marketing
  template composition, queue processing, and retry selection enforce it.
  No sender in a preview means conservative suppression across senders; pass
  `whatsappSenderAccountId` to preview the exact business used at launch.
- Accepted submission, delivery, reading, failure, and replies are independent
  metrics. Campaign detail includes delivery counts, and the dashboard labels
  acceptance separately from delivery. Cached submission/failure/variant counts
  are rebuilt from original message evidence at startup and refreshed on
  delivery receipts and campaign completion. Reading campaign detail computes
  current metrics without changing message history.
- Approved template names and ordered parameters are stored before provider
  I/O. Successful campaign sends advance activity timestamps without moving a
  newer activity timestamp backward. Historical template metadata is not
  invented or backfilled from a lead's current name/country.
- Restarted campaign runs pause for explicit review/resume. Claimed attempts
  with unknown outcomes become `unconfirmed`, not ordinary queued work.
  Resuming does not repeat an existing accepted or uncertain attempt.
- Launch outside configured sending hours returns HTTP 409 with
  `outside_business_hours` before changing campaign state. No overnight
  resumption or sending-window extension is implied.
- Provider error 131056 is a temporary sender-recipient rate limit, not an
  opt-out. Code 131050 remains a marketing opt-out. Recipient marketing-limit
  retries wait at least 24 hours, matching the [YCloud error reference](https://docs.ycloud.com/en/api-reference/guides/whatsapp-platform/whatsapp-error-code).
- Retry classification retains the provider's numeric error code. Marketing
  opt-outs remain excluded even if a previous attempt had a retryable error.
- Campaign eligibility rejects structurally invalid international numbers and
  UK/Australia country/number mismatches, while retaining BSUID-only contacts.
  This is structural validation, not a carrier or WhatsApp registration lookup.

## Validation boundaries

Use synthetic contacts, provider stubs, and a database recreated through the
committed migration chain. Do not launch a customer campaign to test this change.

```sh
npm test
npm run test:integration
npm test --prefix mcp-outboundos
npm run lint --prefix web
npm run typecheck --prefix web
npm run build --prefix web
npm run build:demo --prefix web
npm run check:hygiene
```

The regression fixtures cover caps after suppression, repeated population,
immutable and sender-scoped opt-outs, persisted template parameters before a
mock provider call, live delivery/failure counts, replies remaining in accepted
totals, activity timestamps, launch preflight, interrupted claims, receipt
acknowledgement progression, and numeric retry classification.

These checks establish source behavior, not production deployment or physical
device acceptance. Runtime rollout still requires a verified private backup,
an upgrade rehearsal, protected PR review/merge, compatible images and rollback,
and read-only post-deployment verification. Historical uncertain sends require
original provider evidence or human review; they are not automatically resent.
Existing open issues #3, #4, #12, and #19 retain their real-server, hosted-form,
team, and device acceptance requirements.
