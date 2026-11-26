# Private Sales access and Browser chat

## Prepare the Sales desk

1. Deploy the matching dashboard and API release. Back up the workspace first.
2. Set `OUTBOUNDOS_AGENT_INBOUND_SINCE` in the workspace runtime to the UTC
   timestamp chosen for the new inbound queue. Restart that workspace. With
   this setting, the Sales Agent role is scoped to owned leads. An invalid
   timestamp keeps private access active and closes the claim queue.
3. As the personal admin who owns first touch, open **Team** and choose
   **Use my account** under **Live outreach owner**. Check the stored owner
   and assign the existing conversation leads before inviting a Sales Agent.
4. Invite the teammate as **Agent** using their exact sign-in email. Verify
   their initial Inbox and direct conversation access with a sample account.

Admins keep their existing sales actions and workspace-wide views. Agents
can see their Inbox, Leads and Tasks, and record a closed deal in mobile
Lead details. The server also scopes lead-specific actions. **Unclaimed
WhatsApp** shows the name and arrival time of eligible new contacts. Claiming
takes an atomic ownership update before the transcript becomes available.
Eligibility requires a new lead created by WhatsApp inbound, no owner,
an inbound message and an open conversation with no prior outbound.

The live owner handles new first-touch leads when enabled. New live
IndiaMART imports already carry that owner at capture. Assigned teammates
retain any other contact routed to them, and those contacts stay out of the
default owner's automated first-touch queue. Use **Integrations → Webhooks →
Lead routing** for new website contacts. Existing lead ownership survives
repeat submissions.

## Pilot a storefront source

Use a separate storefront workspace when enquiries and contact histories
must stay separate from the IndiaMART workspace. The workspace deployment
guide describes the separate Clerk organization, runtime, database and
attachments volume. [Workspace setup](workspaces.md)

Start with one storefront and a single quote or contact form. Vendure
keeps order, payment and catalogue state. The server derives the storefront
from the Vendure channel and forwards a stable enquiry ID, submission time,
name, preferred contact and product reference or enquiry text. With consent,
include only the contact preference relevant to the requested follow-up.
Keep the source key server-side and track forwarding and retry state in the
Vendure outbox. Keep banking, invoices and order history in Vendure.

Use the webhook's `test: true` request to inspect mapping and default owner,
then verify a synthetic capture with outreach paused. Compare time to
first response and repeat handling with using Vendure alone before adding
another store.

## Pilot Browser chat on the primary workspace

Set `OUTBOUNDOS_BROWSER_CHAT=true` to expose **Browser chat** beside the
conversation. Create an invite, copy it and share it privately through the
customer's existing channel. Limit access to the intended recipient.
Anyone with the valid link can join until it expires after 24 hours. Revoke
it from the same conversation to close guest access sooner.

The CRM stores a hash of the invitation secret. The fragment is stripped
from the browser address and the guest API receives the token through the
Authorization header. The guest sees only plain-text messages from that
invitation. The team sees Browser chat messages in the lead's existing
timeline and sends replies from the Browser chat panel. A replacement
invitation opens a fresh guest conversation. Use HTTPS for a hosted pilot.

The pilot covers text and periodic refresh. Keep automatic link sending,
public site widgets and customer identity verification out of the initial
rollout. The same lead assignment boundary applies to the staff chat API.
