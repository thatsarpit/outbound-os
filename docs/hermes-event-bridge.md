# Hermes shadow-mode event bridge

## Status and boundary

This change is an **inert local integration foundation**, not an activated service.
No module opens a database, starts a listener, registers a subscription or sends
traffic on import. Transport, context reads and draft generation are explicitly
injected by a trusted adapter. No customer-send tool is included. Existing Hermes
read-only MCP permissions are unchanged.

Development branch: `feat/hermes-shadow-events`, based on `503c10b`. Repository
handoff and GitHub release metadata record application baseline `v0.4.0` at
`7448ac88`; that is not independent verification of the current live revision.
Nothing in this change authorizes deployment, production migration or activation.

## Data flow

1. SQLite triggers write reference-only `HermesInboundEvent` rows inside the same
   transaction as new inbound WhatsApp records, usable human email records or
   newly unmatched email receipts. A failed transaction rolls back both records.
2. `HermesEventStore.claim()` snapshots a quiet message burst, or flushes at its
   maximum wait, into an immutable `HermesEventBatch` with stable identity/body.
3. `dispatchShadowBatch()` is disabled by default. An explicitly supplied HTTPS
   endpoint, signing key and transport can deliver a timestamp-bound V2 request.
4. `HermesShadowInbox.receive()` validates exact bytes, source/route, freshness,
   delivery identity and strict reference-only shape before committing batch and
   event deduplication in a **separate receiver-owned database**.
5. `runNext()` serializes a conversation, obtains explicitly attested complete
   context through an injected read-only adapter, and persists a private draft.
6. Only a persisted successful draft can produce a separately signed completion
   receipt. The sender verifies that receipt and completes the accepted batch
   atomically. A transport 2xx response alone does not release ownership.

## Event capture

The additive migration and Prisma models introduce the event and sender-batch
ledgers. SQL triggers and the active-conversation partial unique index are
managed in the migration. The migration has not been applied to production.

- Canonical IDs: `message:<id>:received`, `receipt:<id>:unmatched`.
- Scope includes channel, receiving account, lead/message or unmatched receipt.
- No body, subject, customer address or secret is copied into event payloads.
- Human email is captured on insertion or an actual NULL-safe transition from
  unusable to usable. Updating an already usable historical email does not backfill.
- Unmatched receipts are captured on insertion or a NULL-safe transition into
  unmatched/unlinked state. A no-op retry of a historical unmatched receipt does
  not backfill. Pending/partial recovery and newly unlinked receipts still qualify.
- Outbound messages, drafts and ordinary lead updates do not create these events.
- Provider-duplicate prevention remains the responsibility of the existing
  ingestion pipeline. These triggers deduplicate canonical database identities;
  they cannot identify two erroneously duplicated source message rows as one.

Unknown senders use receipt-scoped conversations until an authorized association
exists. Catalogue, legal eligibility and customer consent are not inferred here.

## Sender delivery state

`src/services/hermesEventBridge.js` accepts an explicit SQLite connection and does
not resolve a production connection. Claims use `BEGIN IMMEDIATE`, a persistent
conversation uniqueness constraint, token-fenced leases and a bounded in-flight
budget. `MAX_BATCH_EVENTS` is shared with the receiver and capped at 50.

Bodies and delivery identities remain stable across retry/reopen. 429 Retry-After
(delta or date), 5xx and network failures store the next attempt; nonretryable
responses block for operator review. Unrepresentable retry delays also block with
a finite timestamp rather than stranding a pending row at Infinity. No interval,
background loop, subscription or automatic operator retry is installed.

Wire contract:

- JSON `event_type: inbound.batch`, `mode: shadow`, `event_id`, conversation key
  and canonical references only.
- `X-Request-ID` is the stable batch ID.
- `X-Webhook-Timestamp` is fresh integer Unix seconds for each attempt.
- `X-Webhook-Signature-V2` is hex HMAC-SHA256 over `<timestamp>.<exact body>`.
- Redirects are rejected; the explicit transport deadline is shorter than its lease.

The caller must review and pin endpoint/network trust; a URL check alone is not
an outbound-network sandbox. Trusted callbacks are likewise not sandboxed code.

## Receiver and draft processing

Call `initializeShadowInbox(db)` explicitly on an isolated private database, then
construct `HermesShadowInbox` with fixed source, route and ingress secret. CRM
`Lead`/`Message` tables are rejected and foreign keys are enforced. This is not
permission to read production database files or duplicate the CRM.

The receiver owns singleton `HermesShadowSchema` metadata at version 1; it does
not change SQLite `user_version`. Fresh schema creation and its version marker
commit together. Initialization rejects a caller-owned transaction without
altering it; compatible repeat initialization preserves queue rowids, drafts and
conversation locks. Constructor and public operations revalidate the contract.

Standalone reads keep validation and data access in one SQLite snapshot; expiry
takes write ownership before validation. These synchronous helpers can borrow an
existing transaction without committing or rolling it back; stale WAL upgrades
fail instead of restarting the caller's work. Ingress, draft processing and signed
completion receipts require their own transaction, so they cannot report durable
success while the caller could still roll it back. A WAL read may return its
validated older snapshot after another writer commits; the next operation checks
the new schema. This is not separate-process crash/power-loss validation.

Unknown versions, unversioned legacy receivers, missing/changed owned DDL and
TEMP shadow objects fail closed before schema/data repair. Matching is deliberately
exact, not a semantic SQL-equivalence checker. Preserve a private backup and export
queue rowids, drafts and locks for an explicitly reviewed migration; do not drop,
rebuild or silently adopt an incompatible receiver. No legacy migration is supplied.

The receiver limits bodies to 64 KiB, reference arrays to 50 and timestamp skew
to 300 seconds; signatures use timing-safe comparison. Changed content under an
existing batch ID and overlapping canonical event IDs are rejected atomically.
Deduplication persists across reopening. Queue FIFO uses durable insertion order,
not the audit clock; preserve that sequence during any database/queue rebuild.

The context adapter must attest availability, completeness, source, conversation,
channel/account and coverage of all event IDs. Missing/incomplete/wrong context
blocks review without invoking the model. Current allowed MCP tools do **not**
establish canonical event reads, unmatched receipt reads or guaranteed full
message context. Document those gaps; never bypass the adapter with direct API or
production database access.

The draft callback receives fixed shadow/read-only/draft-only policy and untrusted
customer context. Context is used in memory, not stored as a second transcript.
Drafts must be nonempty well-formed UTF-8, free of NUL and at most 16 KiB. Store
receiver drafts privately; no customer or broad Slack publication is implemented.

A processing failure or expired lease becomes `uncertain`, retains conversation
ownership and fences late results. It is not automatically redrafted. Blocked and
uncertain outcomes require explicit future operator resolution; no resolution
endpoint is supplied. Wall-clock lease behavior still requires operational testing.

## Authenticated completion

`completionReceipt()` uses a separate scoped completion key, stable receipt/body
identity and fresh V2 signature. Payloads contain original batch body hash,
source/route, persisted drafted state, draft hash and completion time—not draft
text or customer context.

`receiveCompletion()` validates canonical shape, signature/freshness, expected
scope, stable identity and original sender body hash before completing only an
accepted batch. Freshly signed duplicates are idempotent after reopening both
DBs; conflicting receipts do not mutate a completed result. Completion before
transport acceptance is rejected and can be retried after acceptance. No callback
HTTP route or credential registration is installed.

`complete(id)` remains a **trusted local/test-only primitive**. Never expose it
to remote callers or use it in place of authenticated completion.

## Validation performed

```sh
HERMES_WEBHOOK_SOURCE=/path/to/installed/hermes/gateway/platforms/webhook.py \
  NODE_ENV=test node --test --test-concurrency=1 test/hermes*.test.js
```

Latest parent verification: **60 total, 59 passed, 0 failed, 1 skipped** on Node
26.12.1, with the optional installed-Hermes source probe unset. Tests
apply the complete migration chain to disposable SQLite fixtures and use injected
synthetic transports/context/drafts. They cover transaction and event-storage
failure rollback; historical no-backfill and genuine email/receipt recovery;
deduplication; shared limits; bursts and account scope; retry arithmetic and
responses; timeout/abort; lease fencing; FIFO through clock changes and route
aliases; context failures; draft bounds; receiver authentication/replay/conflicts;
and signed completion acceptance, tampering, wrong scope and idempotency. Receiver
regressions additionally cover atomic initialization/version writes, caller
transaction ownership, future/legacy/schema-drift rejection, runtime revalidation,
TEMP shadowing, and populated repeat initialization preserving FIFO/drafts/locks.
Two-connection DELETE/WAL regressions cover validation/use serialization and
consistent reads. Borrowed-transaction failures preserve caller work; durable
entrypoints reject caller-owned transactions before callbacks or receipt signing.

The optional installed-Hermes contract probe extracts trusted signature methods
offline. It verifies sender bytes and stale/tampered rejection, **not** a listening
HTTP route, complete gateway admission or live model execution. It skips when
`HERMES_WEBHOOK_SOURCE` is unset; the ordinary tests remain portable.

Connection reopen is not process-crash/power-loss evidence. Some synthetic
fixtures disable synchronization for migration speed; do not use those settings
for an operational inbox. Test contact and key values are synthetic.

Repository hygiene passed against the staged task files. Independent review
closed the reproduced correctness findings, including the final historical
unmatched-receipt transition guard. Those defects were addressed with failing
regression tests before fixes. Review approval is limited to this inert local
foundation; it is not security certification or production approval.

## Before ready-to-merge or activation

- Complete independent review and protected repository checks.
- Run full unit/integration suites and Prisma schema/migration parity under Node 24;
  explicitly account for SQL-only triggers/partial indexes.
- Validate real MIME/WhatsApp ingestion, provider overlaps, separate-process
  contention/death, migration/rollback and durable receiver storage permissions.
- Provide a reviewed version-migration/recovery policy before supporting existing
  legacy receiver databases; the current exact versioned contract rejects them
  without modifying their schema or data.
- Prefer canonical-ID-targeted conflict handling over broad `INSERT OR IGNORE`
  before extending the event schema with new constraints.
- Provide approved read-only context/model adapters, endpoint admission and
  completion wiring, operator recovery, retention, and verified private owner
  notification delivery. Existing modules deliberately omit live wiring.
- Verify actual deployed revision through permitted metadata, rehearse backups
  and rollback, and obtain separate deployment/activation approval. Source merge
  does not activate subscriptions or authorize customer outreach.

PR workflows run Node 24 CI and isolated Docker boot checks. The existing image
publish workflow is limited to main/release/manual events; no production deploy
workflow is introduced or invoked by this branch.
