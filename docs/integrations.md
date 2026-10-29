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

## YCloud WhatsApp

YCloud is an alternative official WhatsApp API provider. In WhatsApp settings,
select YCloud on the existing sending account to retain its conversation history.
Use the sender's international number (including `+`), its YCloud WABA ID and a
YCloud API key. Direct Meta credentials are retained for rollback but are never
used by the YCloud transport. The connection check only reads the selected phone
number; it does not send a test message or prove that a message was delivered.

Register `https://<public-api-host>/webhook/ycloud/<account-id>` in YCloud with
`whatsapp.inbound_message.received` and `whatsapp.message.updated`, then save
that endpoint's signing secret in the account settings. The API verifies the
`YCloud-Signature` HMAC over the original request bytes and rejects missing,
invalid or stale signatures. Keep the endpoint and API key secrets out of Git.

Outbound rows retain YCloud's synchronous message ID for receipt reconciliation.
Inbound rows retain the WhatsApp message ID where available, so migration from
Meta does not duplicate the same inbound event. Original inbound timestamps set
the customer service window; replays do not reopen it. Replies cancel pending
outreach before any attachment download. Permanently unavailable attachments
retain a visible placeholder; transient failures retry the file independently
of the already stored reply. Replay recovery only cancels work that preceded
the original inbound row, preserving later manual or out-of-office follow-ups.
Media requests use the configured YCloud API origin, one encoded media ID and
only the signed query fields. Redirects are rejected. Downloads are intentionally
untrusted attachments: size/checksum checks, generated filenames, allowlisted
extensions and mode-0600 files keep them private and separate from application
code. An API key is sent only to that configured provider origin, permitting
recovery after the short signed-link lifetime. Estimated sent prices do not count
as confirmed free delivery.

Before cutover, check for pending messages and running campaigns. After saving,
check the connection, list approved templates and exchange an owned-recipient
test with a reviewed spending limit. Confirm the incoming reply and delivery
receipt in Outbound OS before starting a campaign. For rollback, select Meta
again; the existing account ID, encrypted Meta credentials and history remain.

References: [YCloud API](https://nndocs.ycloud.com/reference/whatsapp_message-send-directly),
[webhooks](https://nndocs.ycloud.com/reference/webhook-integration-guide).
