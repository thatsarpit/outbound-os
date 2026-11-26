# Website chat

Use the same Inbox for website enquiries, support and staff invitations.
Website visitors start a chat by providing a name and their first message or attachment.
They can share an optional email address or international phone for follow-up.
The agent sees these details on the conversation, marked unverified.
They are kept separate from contact matching and automated outreach.
An unassigned conversation is visible in the admin Inbox. In private Sales
mode the agent claim queue shows its channel and arrival time. The agent can
read and reply once the lead is assigned. **Resolve** closes the work item.
A visitor can still read the transcript and submit a new message to reopen it.

## Watch it work

Build the dashboard, then run the isolated preview.

```sh
npm run build --prefix web
node scripts/browser-chat-preview.mjs
```

Open `http://127.0.0.1:4184`. Start a chat on the sample website. **Open agent
Inbox** opens the real dashboard with the sample operator signed in. Reply
there, then close and reopen the website chat to see the saved messages. The
preview uses a temporary SQLite database and listens on loopback.

## Install on a website

Enable Browser chat on the API and set a
map of widget keys in the server environment. Use a distinct key per brand
or department. The widget accepts a title, welcome message, six-digit hex
accent, and a list of exact website origins allowed to embed it.

```dotenv
OUTBOUNDOS_BROWSER_CHAT=true
OUTBOUNDOS_CHAT_WIDGETS='{"support":{"title":"Customer support","welcome":"What can we help with?","accent":"#4257b2","origins":["https://www.example.com"]}}'
```

Add an accessible link and script to the website. Replace the hostname with
the HTTPS origin of the Outbound OS dashboard serving the widget. Find
configured hosted links and embed code under **Integrations → Website chat**.

```html
<a href="https://crm.example.com/chat/widget/support" data-outbound-chat
   aria-haspopup="dialog" aria-expanded="false">Chat with support</a>
<script defer src="https://crm.example.com/outbound-chat.js"></script>
```

The link also works as a hosted chat page and can be shared directly. An
empty origins list allows the hosted page only. If the storefront has a
Content Security Policy, allow the CRM origin in its script and frame rules.
Keep the regular staff dashboard separate from the origin embedded by
customers when possible. Send any public traffic through HTTPS.

## Customer history

On the same browser the widget resumes the conversation when storage is
available. **Save your private return link** gives the customer a way back across
devices or when an embed cannot access browser storage. It expires 90 days
after creation and can be revoked by staff. It gives access to one Browser
chat transcript. Share it privately. The CRM retains the history after
guest access ends. Earlier messages can be loaded from the transcript.

Staff can still create a private, revocable 24-hour invitation for an
existing lead. Use those links for individual guest access to the invitation
conversation.

Website chat is available on the primary workspace. Signed-in customer
identity and account-wide support history require an identity integration.

## Photos and files

Visitors and agents can attach one file per message. The limit is 5 MB per
upload. JPEG, PNG and WebP photos up to 16 megapixels are decoded and
re-encoded as WebP, stripping metadata. Plain-text UTF-8 files are
download-only and limited to 256 KiB. PDFs, archives, Office documents,
SVG, animated images and executable formats are rejected.

The server encrypts attachment bytes in SQLite with the instance
encryption key. Use the standard instance backup and protect its database
and secrets. Downloads are checked against the individual chat link or
staff permissions and have a 90-day lifetime. Expiry clears the stored
bytes while preserving the transcript and attachment name. Apply your
backup retention policy to expire copies in older backups.


## Further work for a support rollout

- Connect signed-in customer identity to verified account history. Anonymous
  chat sessions retain their own transcripts and never aggregate by email.
- Add configurable team routing and support hours, then handoff and escalation.
- Add queue and response-time reporting, per-widget retention settings,
  and a quarantined scanning pipeline before accepting broader file types.
- Add per-workspace widget configuration, transcript exports, and branding
  controls once same-origin and access boundaries are validated.
