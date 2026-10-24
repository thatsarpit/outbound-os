/* ════════════════════════════════════════════════════════════════════════════
   INTEGRATIONS

   One entry per integration page. Every claim here describes what the code in
   github.com/thatsarpit/outbound-os actually does; when a step depends on a
   third party (Meta, marketplace, Zapier), it follows that party's own docs.
════════════════════════════════════════════════════════════════════════════ */

export type IntegrationKind = 'Channel' | 'Lead source' | 'Data out'

export type Integration = {
  slug: string
  name: string
  kind: IntegrationKind
  /** <title>, without the brand suffix. Most specific words first, ~55 chars. */
  title: string
  /** Meta description, ~150 characters, written for the search result. */
  description: string
  h1: string
  /** One-line summary for directory cards. */
  summary: string
  intro: string[]
  connection: {
    method: string
    prerequisites: string[]
    flow: { title: string; body: string }[]
    checkpoint: string
    boundary: string
  }
  capabilities: string[]
  steps: { title: string; body: string }[]
  code?: { label: string; body: string }
  faq: { q: string; a: string }[]
  related: string[]
}

export const integrations: Integration[] = [
  {
    slug: 'whatsapp-cloud-api',
    name: 'WhatsApp Cloud API',
    kind: 'Channel',
    title: 'WhatsApp Cloud API CRM — connect Meta directly',
    description:
      'Connect Meta’s WhatsApp Cloud API directly to Outbound OS for approved templates, customer replies and reported delivery status. Open source and self hosted.',
    h1: 'The WhatsApp Cloud API, connected straight to your CRM.',
    summary: "Meta's official API, no reseller in between. Templates, replies and read receipts.",
    intro: [
      "Outbound OS talks to Meta's WhatsApp Cloud API directly. You create a Meta developer app, add your business number, and configure the number and access token in Integrations → WhatsApp. Messages are submitted from your server to Meta for delivery.",
      'For eligible leads from an enabled live source, first contact can use an approved template. When the lead writes back, the reply lands in the shared inbox and every scheduled follow-up for that lead stops. Inside the 24-hour customer-service window your team answers in free text; outside it, choose an approved template to re-engage the customer.',
    ],
    connection: {
      method: 'Direct Meta API',
      prerequisites: [
        'A Meta business portfolio, developer app and registered WhatsApp number',
        'A system-user token with access to the WhatsApp account',
        'A public HTTPS webhook and an approved outreach template',
      ],
      flow: [
        { title: 'Your business number', body: 'Registered in Meta’s WhatsApp Manager' },
        { title: 'Meta Cloud API', body: 'Submits messages and reports delivery events' },
        { title: 'Shared inbox', body: 'Customer replies and provider status, on the lead' },
      ],
      checkpoint:
        'Read the number’s identity with the connection test, then send an incoming message from a number you own and confirm it appears in the inbox.',
      boundary:
        'A successful connection test is not proof of message delivery. Free-text replies require a customer message to that sending number within the last 24 hours; otherwise use an approved template.',
    },
    capabilities: [
      'First contact with an approved template, filled with the lead’s first name and country',
      'Free-text replies from the inbox inside the 24-hour window',
      'Photos, PDFs, voice notes and videos both ways — kept on your server, shown in the inbox',
      'Provider acceptance, delivery, read and failed states where reported by Meta',
      'Replies stop the lead’s follow-up sequence automatically',
      'A connection test that reads your number’s verified name and quality rating',
      'Several numbers, each with its own hourly and daily limits',
    ],
    steps: [
      {
        title: 'Create a Meta app',
        body: 'At developers.facebook.com, create an app, add the WhatsApp product and register your business number under API Setup.',
      },
      {
        title: 'Generate a system-user token',
        body: 'In Meta Business Settings create a system user, assign the WhatsApp asset and generate a token with the required WhatsApp messaging and management permissions. Choose the duration Meta makes available for your account.',
      },
      {
        title: 'Connect the sending account',
        body: 'Integrations → WhatsApp: add the Meta phone number ID, WhatsApp Business Account ID and access token. Test the connection to read the number’s identity.',
      },
      {
        title: 'Point Meta’s webhook at your server',
        body: 'Set META_APP_SECRET and META_WEBHOOK_VERIFY_TOKEN, then in Meta add https://your-host/webhook/meta and subscribe to messages. Every delivery is signature-checked.',
      },
      {
        title: 'Choose a first-contact template',
        body: 'Create a template in WhatsApp Manager with {{1}} for the first name and {{2}} for the country, and set it as the number’s first-contact template.',
      },
    ],
    code: {
      label: '.env',
      body: 'META_APP_SECRET=your-app-secret\nMETA_WEBHOOK_VERIFY_TOKEN=any-long-random-string',
    },
    faq: [
      {
        q: 'Is the WhatsApp Cloud API free?',
        a: 'Outbound OS has no software licence fee. Meta messaging charges depend on category, destination and applicable service-window rules. Check the current Meta rate card before budgeting.',
      },
      {
        q: 'Do I need a WhatsApp Business Solution Provider (BSP)?',
        a: 'No. The Cloud API is Meta’s own, so you can connect your number directly. No Business Solution Provider is required.',
      },
      {
        q: 'Why must the first message be a template?',
        a: 'WhatsApp only allows free-text messages within 24 hours of the customer’s last message. Anything else — including the first message to a new lead — has to be a template Meta has approved.',
      },
      {
        q: 'Can I use more than one WhatsApp number?',
        a: 'Yes. Each number is its own account in Outbound OS with its own Meta credentials, daily limit and first-contact template, and new leads are spread across the numbers that are ready.',
      },
    ],
    related: ['email', 'webhooks', 'facebook-lead-ads'],
  },
  {
    slug: 'email',
    name: 'Email (SMTP / IMAP)',
    kind: 'Channel',
    title: 'Email outreach from your own mailbox (SMTP/IMAP)',
    description:
      'Send outreach and follow-ups from your own mailboxes over SMTP, sync replies over IMAP, and stop sequences on reply. Open-source and self-hosted.',
    h1: 'Email that sends from your mailbox and stops when they answer.',
    summary: 'SMTP sending and IMAP reply sync for mailboxes that permit these connections.',
    intro: [
      'Connect a mailbox that permits authenticated SMTP sending and IMAP access. Outbound OS sends from that identity and syncs matched replies into the lead’s conversation alongside WhatsApp. Provider and organisation policies determine which credentials you can use.',
      'A reply removes the lead from its sequence. Daily limits per mailbox and rotation across several senders let you control volume, and every message carries a List-Unsubscribe header.',
    ],
    connection: {
      method: 'SMTP + IMAP',
      prerequisites: [
        'A mailbox provider that permits SMTP sending and IMAP access',
        'Provider-approved credentials and server details',
        'A sending domain with the authentication your provider requires',
      ],
      flow: [
        { title: 'Sending identity', body: 'Your mailbox submits email through SMTP' },
        { title: 'Reply mailbox', body: 'IMAP synchronises incoming replies' },
        { title: 'Lead conversation', body: 'Sent messages and matched replies share a thread' },
      ],
      checkpoint:
        'Send to an address you own, reply from that mailbox, and confirm both directions appear against the correct lead.',
      boundary:
        'Sending and receiving are separate connections. A working SMTP test does not verify replies. Provider authentication policies apply; this connection is not a one-click Google or Microsoft OAuth integration.',
    },
    capabilities: [
      'Several mailboxes with per-sender daily limits and rotation',
      'Reply sync over IMAP, threaded on the lead',
      'Follow-up sequences that stop on reply, opt-out or close',
      'List-Unsubscribe on every message; opt-outs are respected everywhere',
      'Credentials encrypted at rest',
    ],
    steps: [
      {
        title: 'Add a mailbox',
        body: 'Integrations → Email → Add account. Enter the SMTP and IMAP server details and the credentials your provider permits. App passwords depend on the provider and account policy; they are not a universal Microsoft 365 solution.',
      },
      {
        title: 'Set a daily limit',
        body: 'Choose a limit appropriate for the sender and provider. Rotation spreads volume; it does not guarantee inbox placement or permission to contact an audience.',
      },
      {
        title: 'Write a template',
        body: 'Templates use {{name}}, {{company}}, {{product}} and {{country}} from the lead record.',
      },
    ],
    faq: [
      {
        q: 'Will replies come back into Outbound OS?',
        a: 'Yes, when the mailbox has IMAP details. Replies are matched to the lead and stop its follow-ups.',
      },
      {
        q: 'Can I use Brevo instead of my own mailbox?',
        a: 'Yes. Brevo is supported for sending and reviewed marketing batches to eligible leads who opted in. Incoming replies need a separate receiving route.',
      },
    ],
    related: ['brevo', 'whatsapp-cloud-api', 'csv-import'],
  },
  {
    slug: 'brevo',
    name: 'Brevo',
    kind: 'Channel',
    title: 'Brevo integration — consent-based email campaigns',
    description:
      'Send email through Brevo and review country-scoped marketing batches before a manual launch. Open-source CRM with recorded consent.',
    h1: 'Brevo for email, with consent tracked on every lead.',
    summary:
      'Email sending and reviewed marketing batches with a saved template, selected senders and an explicit country audience.',
    intro: [
      'Outbound OS can send through Brevo instead of a plain mailbox. Administrators choose countries, a saved template and senders, preview the exact audience, then explicitly launch each marketing batch. Restarts do not select new marketing recipients.',
      'Brevo’s webhook reports deliveries, bounces and unsubscribes back to the lead, so an unsubscribe in Brevo is an opt-out in the CRM.',
    ],
    connection: {
      method: 'Brevo API + webhook',
      prerequisites: [
        'A Brevo API key and verified sending identity',
        'An HTTPS endpoint and a secret for delivery webhooks',
        'A saved template, selected senders and a reviewed audience',
      ],
      flow: [
        { title: 'Reviewed audience', body: 'Choose countries, senders, template and limits' },
        { title: 'Explicit launch', body: 'Submit the batch through your Brevo account' },
        { title: 'Delivery events', body: 'Track reported delivery, bounces and opt-outs' },
      ],
      checkpoint:
        'Verify the sender, review the exact recipients, and use an address you own to check sending and webhook delivery before a customer batch.',
      boundary:
        'A delivery webhook is not a reply mailbox. Configure the incoming email route separately. Provider acceptance is distinct from delivered, and each marketing batch needs a deliberate launch.',
    },
    capabilities: [
      'Brevo as an email sender alongside SMTP mailboxes',
      'Reviewed manual marketing batches to eligible consented leads, off by default',
      'One or more sending domains, rotated',
      'Bounces, complaints and unsubscribes synced back through a secret-protected webhook',
    ],
    steps: [
      {
        title: 'Add Brevo as a sender',
        body: 'Integrations → Email → Add account → Brevo, with your API key and a verified sender.',
      },
      {
        title: 'Set the webhook',
        body: 'Set BREVO_WEBHOOK_PUBLIC_URL and BREVO_WEBHOOK_SECRET, then add https://your-host/webhook/brevo in Brevo.',
      },
      {
        title: 'Review and launch a batch',
        body: 'In Automation, save the country audience, template, senders and quotas. Once delivery is configured, preview the recipients and explicitly launch the reviewed batch.',
      },
    ],
    faq: [
      {
        q: 'Who receives a marketing batch?',
        a: 'Only leads with recorded marketing consent — for example a ticked email_consent box on your form — who have not opted out or bounced.',
      },
    ],
    related: ['email', 'website-forms', 'google-sheets'],
  },
  {
    slug: 'telegram',
    name: 'Telegram',
    kind: 'Channel',
    title: 'Telegram CRM — message leads from your own account',
    description:
      'Connect your own Telegram account to Outbound OS and message leads by username or phone number, with replies in the shared inbox. Open-source.',
    h1: 'Telegram conversations in the same inbox as WhatsApp and email.',
    summary: 'Your own Telegram account, for one-to-one conversations with leads.',
    intro: [
      'Some buyers live on Telegram. Connect your own Telegram account and message a lead by @username or phone number; replies land in the same inbox, on the same lead, as their WhatsApp and email threads.',
      'Telegram is for deliberate one-to-one conversation. It is not used for bulk outreach, which Telegram does not allow for personal accounts.',
    ],
    connection: {
      method: 'Personal account connection',
      prerequisites: [
        'A Telegram account you control',
        'Telegram API credentials for your installation',
        'The recipient’s username, phone number or known peer ID',
      ],
      flow: [
        { title: 'Your Telegram account', body: 'Authenticate the account in your installation' },
        { title: 'One-to-one message', body: 'Choose the lead and message deliberately' },
        { title: 'Shared conversation', body: 'Replies are associated with the lead' },
      ],
      checkpoint:
        'Confirm account readiness and exchange a message with a contact you own before using the channel for a customer conversation.',
      boundary:
        'This is a personal-account channel for individual conversations. It is not a bulk campaign service or a Telegram bot integration.',
    },
    capabilities: [
      'Sign in with your own Telegram account',
      'Message leads by @username, phone number or peer ID',
      'Inbound replies threaded on the lead',
      'Daily limits per account',
    ],
    steps: [
      {
        title: 'Connect an account',
        body: 'Integrations → Telegram → Connect, then confirm the login code Telegram sends you.',
      },
      {
        title: 'Add a Telegram handle to a lead',
        body: 'Enter the lead’s @username or number; the inbox then offers Telegram as a channel.',
      },
    ],
    faq: [
      {
        q: 'Can I send bulk Telegram campaigns?',
        a: 'No. Telegram accounts are for personal conversations, so Outbound OS uses Telegram for one-to-one messages only.',
      },
    ],
    related: ['whatsapp-cloud-api', 'imessage', 'email'],
  },
  {
    slug: 'imessage',
    name: 'iMessage',
    kind: 'Channel',
    title: 'iMessage CRM integration with BlueBubbles',
    description:
      'Reach iPhone buyers on iMessage from Outbound OS through a Mac running BlueBubbles. Replies thread on the lead. Open-source and self-hosted.',
    h1: 'iMessage for the buyers who never open WhatsApp.',
    summary: 'Through a Mac running BlueBubbles, reached over an HTTPS tunnel.',
    intro: [
      'For customers who use iMessage, keep their conversation alongside your other channels. Outbound OS sends iMessages through a Mac running BlueBubbles Server, reached over a secure tunnel, and threads replies on the lead.',
    ],
    connection: {
      method: 'BlueBubbles on your Mac',
      prerequisites: [
        'An always-on Mac signed into iMessage',
        'BlueBubbles Server and its connection password',
        'Secure HTTPS access and the inbound webhook secret',
      ],
      flow: [
        { title: 'Outbound OS', body: 'Sends through the configured relay URL' },
        { title: 'Your Mac', body: 'BlueBubbles relays through the Messages app' },
        { title: 'Customer iMessage', body: 'Replies return through the protected webhook' },
      ],
      checkpoint:
        'Check the relay connection, send to an Apple account you own, and confirm an incoming reply reaches the same lead.',
      boundary:
        'Your Mac is part of the delivery path and must remain available. Outbound OS does not provide a browser-native iMessage API or replace the Apple account.',
    },
    capabilities: [
      'Send and receive iMessages through BlueBubbles',
      'Several Macs, each its own sender',
      'A secret-protected webhook for inbound messages',
    ],
    steps: [
      {
        title: 'Set up BlueBubbles',
        body: 'Install BlueBubbles Server on an always-on Mac and expose it over a Cloudflare Tunnel.',
      },
      {
        title: 'Add the server',
        body: 'Integrations → iMessage → Add server, with its URL and password.',
      },
      {
        title: 'Secure the webhook',
        body: 'Set IMESSAGE_WEBHOOK_SECRET and point BlueBubbles at https://your-host/webhook/imessage?token=<secret>.',
      },
    ],
    faq: [
      {
        q: 'Do I need a Mac?',
        a: 'Yes. iMessage only runs on Apple devices, so a Mac with BlueBubbles Server does the sending.',
      },
    ],
    related: ['telegram', 'whatsapp-cloud-api', 'email'],
  },
  {
    slug: 'facebook-lead-ads',
    name: 'Facebook Lead Ads',
    kind: 'Lead source',
    title: 'Facebook Lead Ads — connect your CRM',
    description:
      'Connect Facebook and Instagram Lead Ads through Zapier, Make or n8n. Map contact details, record consent and route eligible leads to outreach.',
    h1: 'Message your Facebook ad leads while they still remember the ad.',
    summary:
      'Meta instant-form leads through an automation provider, with mapped contact details and consent.',
    intro: [
      'Send Facebook and Instagram instant-form submissions to Outbound OS through Zapier, Make or n8n. The CRM records the lead and evaluates it for your configured first-contact flow.',
      'The Facebook preset already understands the field names instant forms use (full_name, phone_number, email), so most forms need no mapping.',
    ],
    connection: {
      method: 'Through Zapier, Make or n8n',
      prerequisites: [
        'Access to the Meta Page and instant form',
        'An automation tool authorised to read the form’s leads',
        'An Outbound OS source URL, source key and field mapping',
      ],
      flow: [
        { title: 'Meta instant form', body: 'A person submits your Facebook or Instagram form' },
        { title: 'Automation step', body: 'Zapier, Make or n8n maps and posts the lead' },
        { title: 'CRM source', body: 'Validates, merges and evaluates contact eligibility' },
      ],
      checkpoint:
        'Run a mapping test without creating a lead, then use Meta’s test-lead tool and check the source, contact fields and consent recorded in the CRM.',
      boundary:
        'This path uses an external automation provider, not a native direct subscription to Meta Lead Ads. First contact depends on the enabled channel, consent, sender readiness and outreach settings.',
    },
    capabilities: [
      'Works with Zapier, Make, n8n or any tool that can POST JSON',
      'Understands Facebook’s default instant-form field names',
      'First-contact routing for eligible leads when outreach is enabled',
      'Consent checkboxes recorded as marketing consent',
    ],
    steps: [
      {
        title: 'Create a Facebook source',
        body: 'Integrations → Webhooks → Quick add from presets → Facebook Lead Ads. Copy the address and key.',
      },
      {
        title: 'Build the automation',
        body: 'Trigger: Facebook Lead Ads → New lead. Action: Webhooks → POST JSON to the address, with the key in an x-api-key header.',
      },
      {
        title: 'Send a test lead',
        body: 'Use Meta’s Lead Ads Testing Tool, then verify the resulting record and source in Outbound OS. Use a dry-run mapping test before enabling outreach.',
      },
    ],
    faq: [
      {
        q: 'Why go through Zapier, Make or n8n?',
        a: 'Meta delivers lead-ad notifications to an app that then fetches each lead with Graph API permissions. An automation tool already holds that connection, so it is the quickest reliable route; n8n can be self-hosted too.',
      },
    ],
    related: ['zapier', 'website-forms', 'whatsapp-cloud-api'],
  },
  {
    slug: 'zapier',
    name: 'Zapier, Make and n8n',
    kind: 'Lead source',
    title: 'CRM webhooks for Zapier, Make & n8n',
    description:
      'Connect Zapier, Make or n8n with an incoming webhook. Map lead fields, test without creating a record, and configure eligible first contact.',
    h1: 'Any app that Zapier, Make or n8n connects to is a lead source.',
    summary: 'One webhook step turns any app into a lead source.',
    intro: [
      'Incoming webhook sources in Outbound OS use separate source keys. If a tool can send an HTTP POST — Zapier, Make, n8n, Pipedream, your own code — it can create leads, with common field names recognised automatically.',
    ],
    connection: {
      method: 'Keyed incoming webhook',
      prerequisites: [
        'A trigger in Zapier, Make, n8n or your own HTTP client',
        'A separate source URL and key from Outbound OS',
        'Mapped contact fields and the source’s consent requirements',
      ],
      flow: [
        { title: 'Your trigger', body: 'A form, booking or another lead event' },
        { title: 'HTTP POST', body: 'JSON or form fields plus the source key' },
        { title: 'Mapped CRM record', body: 'Create or merge, then evaluate outreach eligibility' },
      ],
      checkpoint:
        'Include “test”: true in the payload to inspect the mapped values without creating a record or sending a message.',
      boundary:
        'The source key is private. Use it from an automation or server, not public browser code. A historical import should use the import route instead of pretending to be a live lead.',
    },
    capabilities: [
      'JSON or form-encoded posts',
      'Common field names recognised without mapping; anything else mapped per source',
      'Per-source keys, rotated independently',
      'A test mode that shows what would be created without creating it',
    ],
    steps: [
      {
        title: 'Create a source',
        body: 'Integrations → Webhooks → Add webhook source. Copy the address and the key — the key is shown once.',
      },
      {
        title: 'Add a webhook step',
        body: 'POST JSON with name, phone, email, company, product and country, and the key in an x-api-key header.',
      },
      {
        title: 'Test first',
        body: 'Add "test": true to the body to see the mapped lead without creating it.',
      },
    ],
    code: {
      label: 'POST /api/webhooks/inbound/<source>',
      body: 'curl -X POST https://your-host/api/webhooks/inbound/<source> \\\n  -H "Content-Type: application/json" \\\n  -H "x-api-key: <key>" \\\n  -d \'{"test":true,"name":"Jane Doe","phone":"+44 7700 900123","email":"jane@example.test","product":"500 units"}\'',
    },
    faq: [
      {
        q: 'What response does the webhook return?',
        a: 'JSON with the lead id, whether it was created or merged into an existing lead, and which channels were queued for first contact.',
      },
    ],
    related: ['facebook-lead-ads', 'website-forms', 'webhooks'],
  },
  {
    slug: 'google-sheets',
    name: 'Google Sheets',
    kind: 'Data out',
    title: 'CRM to Google Sheets — live rows for every lead',
    description:
      'Send every new lead, reply and engaged lead from Outbound OS to a Google Sheet in real time with a small Apps Script. No OAuth, no add-on.',
    h1: 'A Google Sheet that fills itself as leads arrive.',
    summary: 'A live row for every new lead and reply, through a small Apps Script.',
    intro: [
      'Some people will always live in a spreadsheet. Outbound OS posts each event — new lead, reply, engaged — to a Google Apps Script web app you deploy on your own sheet, which writes it as a row under your header names.',
    ],
    connection: {
      method: 'Outbound events + Apps Script',
      prerequisites: [
        'A Google Sheet you control',
        'The supplied Apps Script deployed as a web app',
        'The deployment URL saved in Outbound OS',
      ],
      flow: [
        { title: 'CRM event', body: 'A lead is created, replies or becomes engaged' },
        { title: 'Apps Script', body: 'Receives the event and matches sheet headers' },
        { title: 'New sheet row', body: 'Adds the event’s lead data to your spreadsheet' },
      ],
      checkpoint:
        'Use the connection test and check that a sample row arrives under the expected column headings in your sheet.',
      boundary:
        'This is event export, not a bidirectional spreadsheet CRM. Editing a row does not update the lead, and enabling new events does not backfill every historical record.',
    },
    capabilities: [
      'Rows for lead.created, lead.replied and lead.engaged',
      'Columns matched by header name, so you can reorder or add columns',
      'Retries on temporary failures',
      'No Google OAuth or third-party add-on',
    ],
    steps: [
      {
        title: 'Add the script',
        body: 'In your sheet: Extensions → Apps Script. Paste the script below and save.',
      },
      {
        title: 'Deploy it as a web app',
        body: 'Deploy → New deployment → Web app, executing as you, with access for anyone who has the link.',
      },
      {
        title: 'Paste the URL',
        body: 'Copy the deployment URL into Integrations → Google Sheets, press Test, then Save.',
      },
    ],
    code: {
      label: 'Apps Script (Code.gs)',
      body: "const HEADERS = ['Event','ID','Name','Company','Mobile','Email','Country',\n                 'Product','Quantity','Status','Score','Tier','Source',\n                 'Deal Value','Created At'];\nconst FIELD_BY_HEADER = {\n  'Event': 'event', 'ID': 'id', 'Name': 'name', 'Company': 'company',\n  'Mobile': 'mobile', 'Email': 'email', 'Country': 'country',\n  'Product': 'product', 'Quantity': 'quantity', 'Status': 'status',\n  'Score': 'score', 'Tier': 'leadTier', 'Source': 'source',\n  'Deal Value': 'dealValue', 'Created At': 'createdAt'\n};\n\nfunction doPost(e) {\n  const data = JSON.parse(e.postData.contents);\n  const sheet = SpreadsheetApp.getActiveSpreadsheet().getSheetByName('Leads') ||\n                SpreadsheetApp.getActiveSpreadsheet().getActiveSheet();\n  if (sheet.getLastRow() === 0) sheet.appendRow(HEADERS);\n  const headers = sheet.getRange(1, 1, 1, sheet.getLastColumn())\n                       .getValues()[0].map(String);\n  sheet.appendRow(headers.map(function (h) {\n    const key = FIELD_BY_HEADER[h.trim()];\n    const value = key ? data[key] : undefined;\n    if (key === 'mobile' && value) return \"'\" + value;\n    return value == null ? '' : value;\n  }));\n  return ContentService.createTextOutput(JSON.stringify({ ok: true }))\n                       .setMimeType(ContentService.MimeType.JSON);\n}",
    },
    faq: [
      {
        q: 'Does it copy leads that already exist?',
        a: 'Yes. Backfill existing leads sends every current lead to the sheet in the background; after that, rows arrive as events happen.',
      },
    ],
    related: ['webhooks', 'csv-import', 'zapier'],
  },
  {
    slug: 'webhooks',
    name: 'Lead intake & webhooks',
    kind: 'Data out',
    title: 'CRM webhooks — lead intake and outgoing events',
    description:
      'Connect forms and external systems to your CRM. Import leads with source keys, then send signed lead and message events to your other tools.',
    h1: 'Leads come in. Your other systems stay in sync.',
    summary: 'Source-key lead intake, reviewed imports and signed outgoing events.',
    intro: [
      'Incoming lead sources receive JSON or form posts at /api/webhooks/inbound/<source>, authenticated with the source API key. Map your fields, test the connection and configure first contact before enabling live intake. Website forms and external systems use the same source settings.',
      'Historical exports use the separate connector import endpoint. A configured supplier and source ID preserve attribution; records are deduplicated and conflicts held for review. Imports remain paused and do not queue outreach.',
      'Subscribe a URL to events such as lead.created, lead.replied, lead.engaged and lead.status_changed. Each request carries an X-Webhook-Signature header — an HMAC-SHA256 of the body with your secret — so the receiver can prove it came from your install.',
    ],
    connection: {
      method: 'Incoming keys + outgoing signatures',
      prerequisites: [
        'An HTTPS source or destination that you control',
        'A separate key for each incoming lead source',
        'A signing secret and event selection for outgoing subscriptions',
      ],
      flow: [
        { title: 'Incoming lead', body: 'Source key authenticates a mapped live event' },
        { title: 'CRM record', body: 'Import history stays distinct from live intake' },
        { title: 'Outgoing event', body: 'HMAC signature lets your receiver verify delivery' },
      ],
      checkpoint:
        'Test incoming field mapping without creating a record; for outgoing events, receive a test delivery and verify its raw-body signature.',
      boundary:
        'Incoming live sources, historical imports and outgoing subscriptions have different send behaviour and credentials. Never reuse an incoming source key as an outgoing signing secret.',
    },
    capabilities: [
      'Incoming JSON and HTML forms, with a separate key for each source',
      'Historical connector imports with replay protection and attribution review',
      'Per-subscription event filters, or every event',
      'HMAC-SHA256 signatures with a secret you choose',
      'Works with Zapier, Make, n8n or your own endpoint',
    ],
    steps: [
      {
        title: 'Connect an incoming source',
        body: 'Integrations → Webhooks → Incoming: create a source, copy its URL and key, map fields and test before enabling outreach. The website-forms guide includes examples.',
      },
      {
        title: 'Add an outgoing subscription',
        body: 'Integrations → Webhooks → Outgoing: URL, events and a secret.',
      },
      {
        title: 'Verify the signature',
        body: 'Compute HMAC-SHA256 of the raw body with the secret and compare it with X-Webhook-Signature.',
      },
    ],
    code: {
      label: 'Verify a delivery (Node.js)',
      body: "import crypto from 'node:crypto'\n\nconst expected = 'sha256=' + crypto\n  .createHmac('sha256', process.env.WEBHOOK_SECRET)\n  .update(rawBody)\n  .digest('hex')\nconst received = Buffer.from(req.headers['x-webhook-signature'] ?? '')\nconst signature = Buffer.from(expected)\nconst valid = received.length === signature.length\n  && crypto.timingSafeEqual(signature, received)",
    },
    faq: [
      {
        q: 'Are incoming and outgoing webhook credentials the same?',
        a: 'No. Incoming lead sources use their own API key. Outgoing event subscriptions use an HMAC signing secret. Keep both private; never use one as the other.',
      },
      {
        q: 'Will importing historical leads start a campaign?',
        a: 'No. Connector imports create paused records or preserve existing contact states. Review attribution, consent and your audience before explicitly launching outreach.',
      },
    ],
    related: ['website-forms', 'google-sheets', 'zapier', 'csv-import'],
  },
  {
    slug: 'csv-import',
    name: 'CSV import',
    kind: 'Lead source',
    title: 'CSV lead import — deduplication and review',
    description:
      'Import leads into Outbound OS from a CSV or another CRM export. Common columns are detected, duplicates merge by phone or email, nothing is sent.',
    h1: 'Bring your existing list. Duplicates merge instead of doubling.',
    summary: 'CSV upload with column detection and merging; export back to CSV any time.',
    intro: [
      'Moving from a spreadsheet or another CRM? Upload the export: common column names — name, mobile, phone, email, company, product, country — are detected automatically, and rows that match an existing lead by phone or email merge into it.',
      'An import never messages anyone by itself. Reaching an imported list is a campaign you start on purpose, with approved templates for anyone outside the 24-hour window.',
    ],
    connection: {
      method: 'File import',
      prerequisites: [
        'A CSV export with a header row',
        'Contact fields that can identify a lead',
        'A reviewed source list you are authorised to store and contact',
      ],
      flow: [
        { title: 'CSV file', body: 'Bring contacts from your spreadsheet or CRM' },
        { title: 'Column detection', body: 'Match common fields and merge existing identities' },
        { title: 'Import summary', body: 'Review created, merged and skipped rows' },
      ],
      checkpoint:
        'Check the import summary and a sample of the resulting lead records before preparing any outreach.',
      boundary:
        'Importing does not send messages. Outreach is a separate campaign you review and start; WhatsApp templates are required outside the customer-service window.',
    },
    capabilities: [
      'Column detection for common CRM and marketplace exports',
      'Merging by phone and email, including within the same file',
      'A source column becomes a tag, so each list can be targeted later',
      'Import history showing the batch each lead came from',
      'Export back to CSV at any time — your data is never locked in',
      'Imports never trigger outreach on their own',
    ],
    steps: [
      {
        title: 'Export from where the leads are now',
        body: 'Any CSV with a header row works; the columns above are recognised by name.',
      },
      {
        title: 'Upload',
        body: 'Import → choose the file. The summary shows how many leads were created, merged or skipped.',
      },
      {
        title: 'Start a campaign when ready',
        body: 'Campaigns → New, filtered to the leads you just imported.',
      },
    ],
    faq: [
      {
        q: 'Will importing send messages?',
        a: 'No. Imported leads wait for a campaign you review and start. Live-source first contact is a separate flow that depends on eligibility and your outreach settings.',
      },
      {
        q: 'Can AI agents import leads too?',
        a: 'Yes. The MCP server has an import tool, so Claude or another MCP client can add a list you give it, with the same merging rules.',
      },
    ],
    related: ['webhooks', 'google-sheets', 'email'],
  },
]

/** Directory entries that have their own page elsewhere on the site. */
export const directoryExtras = [
  {
    slug: 'website-forms',
    href: '/form-backend',
    name: 'Website forms',
    kind: 'Lead source' as IntegrationKind,
    method: 'HTML form endpoint',
    summary:
      'Plain HTML, Webflow, WordPress or Framer forms, with a spam trap and a thank-you page.',
  },
  {
    slug: 'mcp',
    href: '/mcp',
    name: 'AI agents (MCP)',
    kind: 'Data out' as IntegrationKind,
    method: 'Remote MCP server',
    summary: 'Connect an MCP-compatible AI client to CRM tools for reads and approved actions.',
  },
]

export function integrationHref(slug: string) {
  const extra = directoryExtras.find((e) => e.slug === slug)
  return extra ? extra.href : `/integrations/${slug}`
}

export function integrationName(slug: string) {
  return (
    integrations.find((i) => i.slug === slug)?.name ??
    directoryExtras.find((e) => e.slug === slug)?.name ??
    slug
  )
}

export function integrationSummary(slug: string) {
  return (
    integrations.find((i) => i.slug === slug)?.summary ??
    directoryExtras.find((e) => e.slug === slug)?.summary ??
    ''
  )
}
