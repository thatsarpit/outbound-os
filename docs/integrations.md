# Integration contracts

Integrations should enter through a service in `src/services/` and expose a
small API binding rather than adding provider-specific behavior throughout the
application.

For every lead source:

- retain the stable provider ID and original event time (`consumedAt`);
- make repeated delivery idempotent;
- normalize contact data without destroying the original identity;
- assign a source and visible failure reason;
- never classify a historical import as a new lead today.

For every outbound channel:

- write the durable message row before sending;
- use a stable idempotency/automation key;
- retain provider message IDs and timestamps;
- advance delivery state monotonically;
- stop automation on reply, opt-out, pause, or close;
- expose authentication and delivery health without leaking credentials.

Add owned-recipient tests and webhook replay tests before enabling a channel in
production. Secrets belong in the environment or encrypted integration rows,
never source control.
