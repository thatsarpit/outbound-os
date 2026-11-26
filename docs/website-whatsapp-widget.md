# Website WhatsApp widget

The widget opens an editable WhatsApp draft. A website click is a click
metric. Outbound OS records a confirmed source when the draft's reference
arrives in an authenticated WhatsApp message.

## Configure one storefront

1. Add a named webhook source for the storefront under **Integrations →
   Webhooks**. Keep its source key in the storefront server's environment.
2. Under **Lead routing**, choose the website lead label and the enabled
   WhatsApp destination account. Use the source name for the individual
   store. Enable capture-only mode if the same source will accept website
   forms. The website label is also recorded on newly captured form leads.
3. From the storefront server, POST JSON to
   `/api/webhooks/whatsapp-handoff/<source>`, or
   `/api/workspaces/<workspace>/webhooks/whatsapp-handoff/<source>` for a
   secondary workspace. Send the key in the `X-Api-Key` header. The response
   contains `{ "url": "https://wa.me/..." }`. The browser never needs the key.
4. Point the existing **Chat on WhatsApp** button to a same-site POST handler.
   Redirect the visitor with HTTP 303. Verify the result points to the
   site's expected WhatsApp number and keep the existing direct link as the
   fallback if the handoff fails. Track clicks using existing site analytics.

The reference expires after 24 hours. It is signed for the source and
recipient account and carries no customer or page details. Once received,
the CRM stores a one-use match with the actual inbound message and shows
the label and store on the message. A new WhatsApp lead can inherit the
label. A returning lead retains its original ownership and acquisition
source. Search for the label or storefront in Leads or Inbox.

If the visitor edits away the reference, the message arrives through the
regular WhatsApp flow and the widget cannot confirm the site. A shared link
identifies a storefront handoff. It cannot establish the visitor's identity
or prove which page they viewed. WhatsApp attribution itself does not
assign the lead or send a message.

## Live rollout

Use a distinct WhatsApp sender and route its provider's verified inbound
callbacks to the same workspace that issues the handoff. The secondary
workspace router supports the storefront's handoff request. The existing
primary provider webhook is independent and must not be used as the
storefront's callback target. Verify the route with a signed synthetic
fixture before changing a live button.

Browser chat invitations are a separate Inbox feature. The invitation pilot
is on the primary workspace and is started by staff. [Browser chat guide](private-sales-and-browser-chat.md)
