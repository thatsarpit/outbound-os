# Optional Cloudflare inbound-mail relay

Status: implemented source and local contract tests; **not deployed or connected to a domain**. Sending stays with the existing provider. Gmail/Outlook OAuth mailbox connectors are separate work.

## Delivery path

1. Cloudflare Email Routing invokes `email()`. The handler awaits `MAIL_SPOOL.put()` of the original MIME and envelope metadata in a **private R2 bucket**. It does not defer storage with `waitUntil`.
2. A required R2 **object-create notification** for `incoming/` publishes an object reference to the delivery Queue. Raw MIME is not placed in a Queue message.
3. `queue()` loads the private object, signs its MIME digest plus envelope, and POSTs to the configured HTTPS Outbound OS ingress endpoint. Redirects are rejected.
4. The Queue message is acknowledged only after a JSON response confirms a durable receipt, and an `accepted/` marker has been stored. Backend outages, authentication errors, identity conflicts and malformed acknowledgements retain the original and retry; exhausted Queue retries go to the configured DLQ.
5. A scheduled bounded cursor scan recovers unacknowledged objects that missed an object-create event. It scans at most 100 keys per run, first gives normal delivery an hour, and throttles explicit recovery enqueue to once per object per 24 hours. A duplicate delivery is safe; backend effects are idempotent.

Original MIME and envelope metadata stay private in R2 (Cloudflare's managed encryption at rest); the backend stores its own original with instance-key encryption. Never enable public bucket access, an `r2.dev` URL or public CORS access to mail. The Worker HTTP handler always returns 404. R2 and Queue access must be restricted to the relay's deployment/service administrators.

If R2 storage itself fails, the handler throws rather than claiming successful storage. **Do not assume that a failed Email Worker is automatically retried by SMTP.** Test actual routing/storage-failure behavior with owned addresses and decide on a verified external fallback before a production cutover. Queue recovery covers mail that reached R2; it cannot reconstruct an original that was never stored.

## Configuration checklist (no commands are run automatically)

- Create a private R2 bucket, delivery Queue and dead-letter Queue. Review current plan entitlements, resource limits and pricing first.
- Copy `wrangler.example.jsonc` to a private deployment configuration, choosing real resource names and the HTTPS ingress URL. The URL must end exactly in `/api/webhooks/email-ingress`, with no query, fragment or embedded credentials.
- Store the same randomly generated, at-least-32-character `EMAIL_INGRESS_SECRET` as a Worker secret and backend environment secret. Do not put it in the config file, chat or source control.
- Configure an R2 **object-create** event rule, prefix `incoming/`, targeting the delivery Queue. Without this rule the immediate event path does not exist; reconciliation alone is not an acceptable untested substitute.
- Enable the backend endpoint explicitly. Set Worker `RELAY_ENABLED=true` only for the controlled pilot after verifying bucket/Queue/cron bindings and backend authentication. The example remains `false`.
- Route only explicitly selected receiving addresses to this Worker after owner recovery/admin addresses have independent destinations. The strict backend currently matches enabled sender email addresses; reply-subdomain aliases require route mapping and Reply-To support before use.
- Alert on Queue backlog, oldest unaccepted R2 object, DLQ messages, ingestion 401/409/503 errors and storage usage. Rehearse replay from retained originals.
- Apply deliberate lifecycle/retention only after backlog and receipt reconciliation are available. This source never deletes originals automatically.

A deployment file and an enabled Worker do not by themselves configure Email Routing, domain MX records, the R2 event rule or the existing backend's ingress secret. Those remain explicit rollout steps. Do not disable the existing IMAP path until the controlled overlap test reconciles accounts, messages, threads and notifications.

See the [backend contract and remaining acceptance work](../../docs/inbound-email-receiver.md).

Current provider references: [Email Worker handler](https://developers.cloudflare.com/email-service/api/route-emails/email-handler/), [R2 object notifications](https://developers.cloudflare.com/r2/buckets/event-notifications/), [Queue JavaScript API](https://developers.cloudflare.com/queues/configuration/javascript-apis/), [R2 data security](https://developers.cloudflare.com/r2/reference/data-security/).
