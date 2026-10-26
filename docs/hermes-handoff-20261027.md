# Hermes integration handoff — October 27, 2026

## Preserved state

This is an unfinished code checkpoint copied from the Hermes workspace. It is not
an operational sales integration or a deployment request. Its parent is
`aec676e15557f8583a4f74776ffe86a227a3e81f` from draft PR #67.

The published foundation implements transactional reference-only event capture,
durable sender batches/retries, signed receiver admission, private draft storage,
conversation ordering, signed completion receipts, and an isolated schema-parity
CI gate. Existing source documentation describes the contracts and limitations.

This checkpoint adds the previously unpublished canonical read adapter and
synthetic ingress/separate-process test harness files, plus their package script.
No customer records, workspace reports, credentials, databases or live settings
are included.

## Fresh checkpoint validation

On macOS with Node v26.8.2:

    node --test --test-concurrency=1 test/hermesCanonicalReadAdapter.test.js test/hermesProcessHarness.test.js test/hermesIngressHarness.test.js

Result: 18 tests, 16 passed, 2 failed. The failures are preserved deliberately:

1. Canonical snapshot consistency/event-capture-time regression fails because
   the partial adapter does not yet enforce all required provenance guards.
2. Real-ingress child fixture compares a macOS `/private/var/...` working path
   against its `/var/...` alias before reaching dependency-backed scenarios.
   Full ingress execution remains unverified in this checkout, which has no
   installed project dependencies.

Separate-process contention, fencing, process-death/replay, FIFO and transaction
rollback tests passed in this run. No full unit/integration/Prisma gate or new
independent review has been run against this checkpoint. Previous CI success
belongs to its published parent, not these files. `git diff --check` passed.

## Next implementation steps

1. Finish canonical snapshot validation, including explicit consistency,
   observation time covering requested events, null-safe attachment checks,
   immutable pre-await scope, and receiver rejection tests.
2. Make the synthetic ingress harness portable; install repository dependencies
   locally and run actual WhatsApp/MIME/provider-overlap acceptance tests.
3. Supply real scoped canonical read endpoints and the model/admission runner;
   the current injected adapter is not a live CRM source.
4. Add bounded, auditable write/send operations using existing official channel
   APIs and preserve opt-out, pause/reply stops, deduplication and recipient-local
   quiet hours. This checkpoint itself provides no customer-send capability.
5. Exercise full CI, migration rehearsal and controlled end-to-end tests before
   any merge/deployment/production activation or campaign launch.

The VM checkout is preserved untouched. Further implementation is intended to
continue from the local handoff checkout rather than concurrent remote writers.

## Sales operations cutover

The two checkpoint failures above have since been fixed: snapshots require an
explicit consistency attestation and observation time covering every event;
attachment validation is null-safe and request scopes are copied before awaits.
The synthetic ingress harness resolves macOS temporary-directory aliases. Fresh
focused validation passes 18/18 tests. The main suite passes 414 with one optional
skip and four existing TODOs; the nine harness tests and 131 API integration tests
pass. Prisma parity and its intentional-drift negative control pass with
`RUST_LOG=debug` on macOS.

The immediate sales path is the separate private owner-approved facade documented
in `integrations/hermes-sales/README.md`. It uses existing production channel and
campaign engines, and adds missing MCP population/audience/sender tools. Its ten
approval tests and 24 MCP tests pass. The shadow-event foundation remains inactive
and is not a prerequisite for on-demand campaign operations. Do not present it as
an automatically operating inbound drafting service.
