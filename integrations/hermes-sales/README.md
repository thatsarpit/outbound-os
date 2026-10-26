# Hermes sales connection

This small private facade enables on-demand sales operations using the existing
Outbound OS MCP tools. It does not require the unfinished shadow-event integration
or its production database migration. Hermes has no CRM database mount, Docker
socket, upstream credential, coding tools or deployment authority.

## Operation

Hermes can research leads, read conversations, inspect sender readiness, draft and
edit campaigns, populate a draft audience, assign leads and pause outreach.
Customer messages, campaign launch/resume, imports and other lead mutations create
an approval request instead of executing. Hermes returns its private link to the
owner; an authenticated browser POST is the only route to execute those actions.
The owner uses the existing Hermes dashboard admin password. The facade stores a
salted PBKDF2 hash, never that password. Login lasts eight hours.

Approval URLs are served at `/sales/approval/<opaque-id>` through private Tailscale
HTTPS. Only port 9120 is published, to host loopback, by a separate approvals
container that is absent from the Hermes bridge. Port 9118 is MCP-only on the
isolated bridge; that container has no approval listener. Approval HTTP routes are unavailable there; the owner session
cookie is unavailable to MCP. Preserve the existing firewall rules, including only
the Hermes-to-adapter port 9118 exception. Never use Funnel/public exposure.

Launch approval records show the actual campaign content, sender IDs and populated
audience, not a guessed filter count. The facade rechecks these before launch and
rejects changes. The CRM remains responsible for live recipient stop rules and
provider eligibility; approval is not a distributed lock against simultaneous CRM
administrators. Do not edit a campaign while its launch is being approved.

SQLite claims an action before any network effect. Duplicate approvals reuse the
stored result; crashes/timeouts retain running/uncertain state and are never
automatically replayed. Review the CRM before preparing a replacement request.
WhatsApp sends receive a stable client message ID before approval. An optional
`_request_id` identifies a separate intended operation; retries must reuse it.
Without it, identical arguments are deduplicated for 24 hours. Pending approvals
expire after 30 minutes. Private approval arguments/results are retained for seven
days and then removed when a new request is prepared. Back up the state directory
privately; it can contain customer message drafts and selected audience details.

## Deployment

Deploy `gateway.py` and `compose.yaml` into a private root-owned directory, create
`state/` owned by UID 10000, and supply a mode-0600 `private.env` containing:

```
BRIDGE_TOKEN=<Hermes-only random bearer>
UPSTREAM_TOKEN=<existing MCP service bearer, never provided to Hermes>
APPROVAL_ORIGIN=https://your-private-node.example.test
OWNER_PASSWORD_SALT=<random 16-byte hex>
OWNER_PASSWORD_HASH=<PBKDF2-HMAC-SHA256, 300000 iterations, hex>
OWNER_SESSION_KEY=<independent random signing secret>
```

Stop the old readonly facade before reusing its fixed IP. Start this Compose
service and configure Tailscale Serve path `/sales` to
`http://127.0.0.1:9120/sales`. Keep the existing `/` dashboard handler. Update Hermes
to one `outbound_sales` MCP connection at `http://172.30.91.3:9118/mcp` with only
its bridge bearer. The MCP upstream must include `populate_campaign`,
`campaign_leads`, `email_accounts`, explicit campaign sender fields and
channel-aware preview from this revision. Personal public MCP grants remain
read-only; this private owner-approved service is a separate connection.

Verify facade health, authenticated tool discovery, denied destructive/admin
methods, private login page and actual sender readiness. Do not send synthetic
tests to customers. Roll back by stopping this facade and restoring the old
readonly facade/config; retain the approval ledger to prevent lost execution
history. No new paid service or resource resize is needed. Actual provider sends
can incur the channel's existing charges.

## Tests

```
python3 -m unittest discover -s integrations/hermes-sales -v
npm test --prefix mcp-outboundos
```
