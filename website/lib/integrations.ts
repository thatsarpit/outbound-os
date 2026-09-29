/* ════════════════════════════════════════════════════════════════════════════
   INTEGRATIONS

   One entry per integration page. Every claim here describes what the code in
   github.com/thatsarpit/outbound-os actually does; when a step depends on a
   third party (Meta, IndiaMART, Zapier), it follows that party's own docs.
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
      "Send WhatsApp templates and replies through Meta's official Cloud API, no middleman. Open-source, self-hosted CRM. Set up in about 15 minutes.",
    h1: 'The WhatsApp Cloud API, connected straight to your CRM.',
    summary: "Meta's official API, no reseller in between. Templates, replies and read receipts.",
    intro: [
      "Outbound OS talks to Meta's WhatsApp Cloud API directly. You create a Meta developer app, add your business number, and paste two values into Settings: the phone number ID and a permanent access token. Messages go from your server to Meta and nowhere else.",
      'A new lead is contacted with an approved template the moment it arrives. When the lead writes back, the reply lands in the shared inbox and every scheduled follow-up for that lead stops. Inside the 24-hour customer-service window your team answers in free text; outside it, the system uses a template, because that is what WhatsApp requires.',
    ],
    capabilities: [
      'First contact with an approved template, filled with the lead’s first name and country',
      'Free-text replies from the inbox inside the 24-hour window',
      'Photos, PDFs, voice notes and videos both ways — kept on your server, shown in the inbox',
      'Sent, delivered and read receipts on every message',
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
        title: 'Generate a permanent token',
        body: 'In Meta Business Settings create a System User, give it the whatsapp_business_messaging permission and generate a token that does not expire.',
      },
      {
        title: 'Paste two values into Outbound OS',
        body: 'Settings → WhatsApp → Meta Cloud API: the phone number ID and the token. Press Test connection; it shows the number’s verified name.',
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
        a: 'Meta hosts the Cloud API at no cost, and Outbound OS is free. Meta charges per message: templates by category and the recipient’s country, and — from 1 October 2026 — replies inside the 24-hour customer-service window as well. Check Meta’s current rate card before budgeting.',
      },
      {
        q: 'Do I need a WhatsApp Business Solution Provider (BSP)?',
        a: 'No. The Cloud API is Meta’s own, so you can connect your number directly. If you already use AiSensy, Outbound OS supports that too, chosen per number.',
      },
      {
        q: 'Why must the first message be a template?',
        a: 'WhatsApp only allows free-text messages within 24 hours of the customer’s last message. Anything else — including the first message to a new lead — has to be a template Meta has approved.',
      },
      {
        q: 'Can I use more than one WhatsApp number?',
        a: 'Yes. Each number is its own account in Outbound OS with its own provider, daily limit and first-contact template, and new leads are spread across the numbers that are ready.',
      },
    ],
    related: ['aisensy', 'indiamart', 'facebook-lead-ads'],
  },
  {
    slug: 'aisensy',
    name: 'AiSensy',
    kind: 'Channel',
    title: 'AiSensy CRM integration — open-source and self-hosted',
    description:
      'Already on AiSensy? Connect it to Outbound OS, an open-source CRM: send AiSensy campaigns to new leads instantly and handle replies in one inbox.',
    h1: 'Keep AiSensy. Add a CRM that follows up for you.',
    summary: 'Use an existing AiSensy number: API campaigns for templates, Project API for replies.',
    intro: [
      'If your WhatsApp number already runs through AiSensy, you do not have to move it. Choose AiSensy as the provider for that number and Outbound OS sends through AiSensy’s API Campaigns for templates and its Project API for free-text replies.',
      'Leads from your website, ads and marketplaces get their first AiSensy campaign within seconds of arriving, and a reply stops every scheduled follow-up. Other numbers in the same install can use Meta’s Cloud API directly.',
    ],
    capabilities: [
      'Approved-template outreach through AiSensy API Campaigns',
      'Free-text replies through the AiSensy Project API (Pro plan)',
      'Inbound replies and delivery receipts through a signed webhook',
      'Per-number choice between AiSensy and Meta’s Cloud API',
      'Campaign names used directly as first-contact and campaign templates',
    ],
    steps: [
      {
        title: 'Copy your API Campaign key',
        body: 'In AiSensy: Manage → API Key. Paste it in Outbound OS under Settings → WhatsApp → AiSensy.',
      },
      {
        title: 'Name a first-contact campaign',
        body: 'Create an API campaign in AiSensy that wraps an approved template, and enter its name as the number’s first-contact campaign.',
      },
      {
        title: 'Add Project API credentials for replies',
        body: 'Optional, on AiSensy’s Pro plan: the Project ID and Project API password enable free-text replies from the inbox.',
      },
      {
        title: 'Secure the webhook',
        body: 'Set AISENSY_WEBHOOK_SECRET and configure https://your-host/webhook/whatsapp-cloud?token=<secret> in AiSensy. Deliveries without it are rejected.',
      },
    ],
    faq: [
      {
        q: 'Do I have to leave AiSensy to use Outbound OS?',
        a: 'No. AiSensy is a supported provider. You can keep every number on AiSensy, move some to Meta’s Cloud API, or mix the two.',
      },
      {
        q: 'Why does AiSensy need a campaign name instead of a template name?',
        a: 'AiSensy’s API addresses a campaign, which wraps the approved template. Sending a template name returns “Campaign does not exist”.',
      },
      {
        q: 'What does Outbound OS add on top of AiSensy?',
        a: 'Lead capture from every source, instant first contact, follow-up sequences that stop on reply, email, Telegram and iMessage alongside WhatsApp, a pipeline, and an MCP server for AI agents — on your own server.',
      },
    ],
    related: ['whatsapp-cloud-api', 'indiamart', 'email'],
  },
  {
    slug: 'email',
    name: 'Email (SMTP / IMAP)',
    kind: 'Channel',
    title: 'Email outreach from your own mailbox (SMTP/IMAP)',
    description:
      'Send outreach and follow-ups from your own mailboxes over SMTP, sync replies over IMAP, and stop sequences on reply. Open-source and self-hosted.',
    h1: 'Email that sends from your mailbox and stops when they answer.',
    summary: 'Any mailbox over SMTP, replies synced over IMAP, sequences that stop on reply.',
    intro: [
      'Connect Google Workspace, Microsoft 365, Zoho or any mailbox that speaks SMTP and IMAP. Outbound OS sends outreach and follow-ups from it, and syncs replies back so the thread sits on the lead next to WhatsApp.',
      'A reply removes the lead from its sequence. Daily limits per mailbox and rotation across several senders protect your domain’s reputation, and every message carries a List-Unsubscribe header.',
    ],
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
        body: 'Settings → Email → Add account. Enter the SMTP and IMAP details; for Gmail and Microsoft 365 use an app password.',
      },
      {
        title: 'Set a daily limit',
        body: 'Start low on a new domain and raise it as replies come in. Rotation spreads volume across mailboxes.',
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
        a: 'Yes. Brevo is supported for sending and for scheduled marketing email to leads who opted in.',
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
      'Send email through Brevo and run a daily marketing email to leads who opted in, with bounces and unsubscribes synced back. Open-source CRM.',
    h1: 'Brevo for email, with consent tracked on every lead.',
    summary: 'Transactional sending and a daily consented marketing email, with events synced back.',
    intro: [
      'Outbound OS can send through Brevo instead of a plain mailbox, and can run a once-a-day marketing email to leads who ticked “email me” on your form — only those leads, with the time and source of their consent recorded.',
      'Brevo’s webhook reports deliveries, bounces and unsubscribes back to the lead, so an unsubscribe in Brevo is an opt-out in the CRM.',
    ],
    capabilities: [
      'Brevo as an email sender alongside SMTP mailboxes',
      'Daily marketing campaign to consented leads only, off by default',
      'One or more sending domains, rotated',
      'Bounces, complaints and unsubscribes synced back through a secret-protected webhook',
    ],
    steps: [
      { title: 'Add Brevo as a sender', body: 'Settings → Email → Add account → Brevo, with your API key and a verified sender.' },
      {
        title: 'Set the webhook',
        body: 'Set BREVO_WEBHOOK_PUBLIC_URL and BREVO_WEBHOOK_SECRET, then add https://your-host/webhook/brevo in Brevo.',
      },
      { title: 'Turn on the daily email', body: 'It is off on new installs. Enable it once consent, senders and the webhook are in place.' },
    ],
    faq: [
      {
        q: 'Who receives the daily marketing email?',
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
    capabilities: [
      'Sign in with your own Telegram account',
      'Message leads by @username, phone number or peer ID',
      'Inbound replies threaded on the lead',
      'Daily limits per account',
    ],
    steps: [
      { title: 'Connect an account', body: 'Integrations → Telegram → Connect, then confirm the login code Telegram sends you.' },
      { title: 'Add a Telegram handle to a lead', body: 'Enter the lead’s @username or number; the inbox then offers Telegram as a channel.' },
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
    title: 'iMessage CRM — send iMessages from your CRM (BlueBubbles)',
    description:
      'Reach iPhone buyers on iMessage from Outbound OS through a Mac running BlueBubbles. Replies thread on the lead. Open-source and self-hosted.',
    h1: 'iMessage for the buyers who never open WhatsApp.',
    summary: 'Through a Mac running BlueBubbles, reached over an HTTPS tunnel.',
    intro: [
      'In the US and UK many buyers answer a blue bubble faster than an email. Outbound OS sends iMessages through a Mac running BlueBubbles Server, reached over a secure tunnel, and threads replies on the lead.',
    ],
    capabilities: [
      'Send and receive iMessages through BlueBubbles',
      'Several Macs, each its own sender',
      'A secret-protected webhook for inbound messages',
    ],
    steps: [
      { title: 'Set up BlueBubbles', body: 'Install BlueBubbles Server on an always-on Mac and expose it over a Cloudflare Tunnel.' },
      { title: 'Add the server', body: 'Settings → iMessage → Add server, with its URL and password.' },
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
    slug: 'indiamart',
    name: 'IndiaMART',
    kind: 'Lead source',
    title: 'IndiaMART CRM integration — reply to every lead in seconds',
    description:
      "Connect IndiaMART's Lead Manager Push API to Outbound OS and contact every buyer enquiry on WhatsApp and email within seconds. Free, open-source.",
    h1: 'Every IndiaMART enquiry answered in seconds, not hours.',
    summary: "IndiaMART's Lead Manager Push API, straight into the queue.",
    intro: [
      'On IndiaMART the first seller to reply usually wins the conversation. Outbound OS receives each enquiry through IndiaMART’s Lead Manager Push API the moment the buyer sends it, creates the lead with name, phone, email, company, product and country, and sends your first WhatsApp template and email straight away.',
      'Duplicate enquiries from the same buyer merge into one lead instead of creating a second one, and a reply on any channel stops the follow-ups.',
    ],
    capabilities: [
      'Real-time leads from IndiaMART’s official Push API',
      'Name, mobile, email, company, product and country mapped automatically',
      'Instant first contact on WhatsApp, email and any other connected channel',
      'Duplicate enquiries merged into the existing lead',
      'Every lead keeps its source, so IndiaMART leads can be filtered and reported on separately',
    ],
    steps: [
      {
        title: 'Create an IndiaMART source',
        body: 'Integrations → Webhooks → Quick add from presets → IndiaMART. Copy the address and key it gives you, and join them as <address>?apiKey=<key>, because IndiaMART does not send a login header.',
      },
      {
        title: 'Turn on the Push API in IndiaMART',
        body: 'In the seller panel: Lead Manager → Import/Export Leads → Push API → choose “Other” and paste the address.',
      },
      {
        title: 'Check it arrived',
        body: 'The next enquiry appears in Leads within seconds, and the first-touch messages show in the inbox.',
      },
    ],
    code: {
      label: 'What IndiaMART sends (abridged)',
      body: '{\n  "CODE": 200,\n  "STATUS": "SUCCESS",\n  "RESPONSE": {\n    "UNIQUE_QUERY_ID": "621654886",\n    "SENDER_NAME": "Prabhat",\n    "SENDER_MOBILE": "+91-9999999999",\n    "SENDER_EMAIL": "buyer@example.com",\n    "SENDER_COMPANY": "ABC Pvt Ltd.",\n    "QUERY_PRODUCT_NAME": "Mineral Water Bottle",\n    "SENDER_COUNTRY_ISO": "IN"\n  }\n}',
    },
    faq: [
      {
        q: 'Does this use IndiaMART’s official API?',
        a: 'Yes — the Lead Manager Push API, which IndiaMART documents for third-party CRMs. Outbound OS does not log in to your seller account or scrape pages.',
      },
      {
        q: 'What happens if my server is down when a lead arrives?',
        a: 'IndiaMART retries a push until your server accepts it, and deactivates the Push API only after 48 hours of continuous failure.',
      },
      {
        q: 'Can I also connect TradeIndia or JustDial?',
        a: 'Yes. Both have presets under Integrations → Webhooks; check the field map against what your account sends on the first delivery.',
      },
      {
        q: 'Will international IndiaMART buyers be contacted correctly?',
        a: 'Yes. Numbers with a country code are used as sent. Set a home country code only for numbers that arrive without one.',
      },
    ],
    related: ['whatsapp-cloud-api', 'engyne-cloud', 'csv-import'],
  },
  {
    slug: 'facebook-lead-ads',
    name: 'Facebook Lead Ads',
    kind: 'Lead source',
    title: 'Facebook Lead Ads to WhatsApp — contact ad leads instantly',
    description:
      'Send Facebook and Instagram Lead Ads into Outbound OS through Zapier, Make or n8n and message every lead on WhatsApp within seconds.',
    h1: 'Message your Facebook ad leads while they still remember the ad.',
    summary: 'Meta instant-form leads through Zapier, Make or n8n, contacted in seconds.',
    intro: [
      'A lead from a Facebook or Instagram instant form is warmest in the first few minutes. Send each one to Outbound OS through Zapier, Make or n8n and it is on WhatsApp and email before the prospect has closed the app.',
      'The Facebook preset already understands the field names instant forms use (full_name, phone_number, email), so most forms need no mapping.',
    ],
    capabilities: [
      'Works with Zapier, Make, n8n or any tool that can POST JSON',
      'Understands Facebook’s default instant-form field names',
      'Instant first contact on every connected channel',
      'Consent checkboxes recorded as marketing consent',
    ],
    steps: [
      { title: 'Create a Facebook source', body: 'Integrations → Webhooks → Quick add from presets → Facebook Lead Ads. Copy the address and key.' },
      {
        title: 'Build the automation',
        body: 'Trigger: Facebook Lead Ads → New lead. Action: Webhooks → POST JSON to the address, with the key in an x-api-key header.',
      },
      { title: 'Send a test lead', body: 'Use Meta’s Lead Ads Testing Tool; the lead appears in Outbound OS within seconds.' },
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
    title: 'Zapier, Make & n8n to WhatsApp CRM — webhook integration',
    description:
      'Send leads from any app into Outbound OS with one webhook step in Zapier, Make or n8n, and contact them on WhatsApp and email instantly.',
    h1: 'Any app that Zapier, Make or n8n connects to is a lead source.',
    summary: 'One webhook step turns any app into a lead source.',
    intro: [
      'Every lead source in Outbound OS is a signed webhook. If a tool can send an HTTP POST — Zapier, Make, n8n, Pipedream, your own code — it can create leads, with common field names recognised automatically.',
    ],
    capabilities: [
      'JSON or form-encoded posts',
      'Common field names recognised without mapping; anything else mapped per source',
      'Per-source keys, rotated independently',
      'A test mode that shows what would be created without creating it',
    ],
    steps: [
      { title: 'Create a source', body: 'Integrations → Webhooks → Add webhook source. Copy the address and the key — the key is shown once.' },
      {
        title: 'Add a webhook step',
        body: 'POST JSON with name, phone, email, company, product and country, and the key in an x-api-key header.',
      },
      { title: 'Test first', body: 'Add "test": true to the body to see the mapped lead without creating it.' },
    ],
    code: {
      label: 'POST /api/webhooks/inbound/<source>',
      body: 'curl -X POST https://your-host/api/webhooks/inbound/<source> \\\n  -H "Content-Type: application/json" \\\n  -H "x-api-key: <key>" \\\n  -d \'{"name":"Jane Doe","phone":"+44 7700 900123","email":"jane@example.com","product":"500 units"}\'',
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
    slug: 'engyne-cloud',
    name: 'Engyne Cloud',
    kind: 'Lead source',
    title: 'Engyne Cloud integration — captured leads, contacted instantly',
    description:
      'Connect Engyne Cloud to Outbound OS: every lead it captures arrives with phone and email and is contacted on WhatsApp and email within seconds.',
    h1: 'Engyne Cloud captures the lead. Outbound OS makes the first move.',
    summary: 'Engyne Cloud lead.captured events, with phone and email, contacted in seconds.',
    intro: [
      'Engyne Cloud captures marketplace leads for your seller accounts. Its admin webhook posts a lead.captured event for each one; Outbound OS reads the buyer from the event and starts first contact immediately.',
      'A lead first delivered without a phone number is updated in place when Engyne resolves it, so nothing is duplicated.',
    ],
    capabilities: [
      'Reads Engyne’s lead.captured envelope without mapping',
      'Backfills the phone number on a re-delivery',
      'Engyne’s Test button is honoured: nothing is created or sent',
    ],
    steps: [
      { title: 'Create an Engyne source', body: 'Integrations → Webhooks → Quick add from presets → Engyne Cloud.' },
      { title: 'Paste it into Engyne', body: 'Engyne Cloud → Admin → Webhooks: add the address and key, then press Test.' },
    ],
    faq: [
      {
        q: 'Does the Test button create a lead?',
        a: 'No. A test delivery returns what would be created and sends nothing.',
      },
    ],
    related: ['indiamart', 'whatsapp-cloud-api', 'zapier'],
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
    capabilities: [
      'Rows for lead.created, lead.replied and lead.engaged',
      'Columns matched by header name, so you can reorder or add columns',
      'Retries on temporary failures',
      'No Google OAuth or third-party add-on',
    ],
    steps: [
      { title: 'Add the script', body: 'In your sheet: Extensions → Apps Script. Paste the script below and save.' },
      { title: 'Deploy it as a web app', body: 'Deploy → New deployment → Web app, executing as you, with access for anyone who has the link.' },
      { title: 'Paste the URL', body: 'Copy the deployment URL into Integrations → Google Sheets, press Test, then Save.' },
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
    name: 'Outgoing webhooks',
    kind: 'Data out',
    title: 'CRM outgoing webhooks — signed lead and message events',
    description:
      'Subscribe any URL to lead and message events from Outbound OS. Every request is signed with HMAC-SHA256 so your receiver can verify it.',
    h1: 'Tell your other systems the moment something happens.',
    summary: 'Signed POSTs to your URLs on lead and message events.',
    intro: [
      'Subscribe a URL to events such as lead.created, lead.replied, lead.engaged and lead.status_changed. Each request carries an X-Webhook-Signature header — an HMAC-SHA256 of the body with your secret — so the receiver can prove it came from your install.',
    ],
    capabilities: [
      'Per-subscription event filters, or every event',
      'HMAC-SHA256 signatures with a secret you choose',
      'Works with Zapier, Make, n8n or your own endpoint',
    ],
    steps: [
      { title: 'Add a subscription', body: 'Integrations → Webhooks → Outgoing: URL, events and a secret.' },
      { title: 'Verify the signature', body: 'Compute HMAC-SHA256 of the raw body with the secret and compare it with X-Webhook-Signature.' },
    ],
    code: {
      label: 'Verify a delivery (Node.js)',
      body: "import crypto from 'node:crypto'\n\nconst expected = 'sha256=' + crypto\n  .createHmac('sha256', process.env.WEBHOOK_SECRET)\n  .update(rawBody)\n  .digest('hex')\nconst valid = crypto.timingSafeEqual(\n  Buffer.from(expected),\n  Buffer.from(req.headers['x-webhook-signature'] ?? ''),\n)",
    },
    faq: [],
    related: ['google-sheets', 'zapier', 'csv-import'],
  },
  {
    slug: 'csv-import',
    name: 'CSV import',
    kind: 'Lead source',
    title: 'Import leads from CSV — deduplicated, never auto-messaged',
    description:
      'Import leads into Outbound OS from a CSV or another CRM export. Common columns are detected, duplicates merge by phone or email, nothing is sent.',
    h1: 'Bring your existing list. Duplicates merge instead of doubling.',
    summary: 'CSV upload with column detection and merging; export back to CSV any time.',
    intro: [
      'Moving from a spreadsheet or another CRM? Upload the export: common column names — name, mobile, phone, email, company, product, country — are detected automatically, and rows that match an existing lead by phone or email merge into it.',
      'An import never messages anyone by itself. Reaching an imported list is a campaign you start on purpose, with approved templates for anyone outside the 24-hour window.',
    ],
    capabilities: [
      'Column detection for common CRM and marketplace exports',
      'Merging by phone and email, including within the same file',
      'A source column becomes a tag, so each list can be targeted later',
      'Import history showing the batch each lead came from',
      'Export back to CSV at any time — your data is never locked in',
      'Imports never trigger outreach on their own',
    ],
    steps: [
      { title: 'Export from where the leads are now', body: 'Any CSV with a header row works; the columns above are recognised by name.' },
      { title: 'Upload', body: 'Import → choose the file. The summary shows how many leads were created, merged or skipped.' },
      { title: 'Start a campaign when ready', body: 'Campaigns → New, filtered to the leads you just imported.' },
    ],
    faq: [
      {
        q: 'Will importing send messages?',
        a: 'No. Only leads arriving through a live source get automatic first contact. Imported leads wait for a campaign you start.',
      },
      {
        q: 'Can AI agents import leads too?',
        a: 'Yes. The MCP server has an import tool, so Claude or another MCP client can add a list you give it, with the same merging rules.',
      },
    ],
    related: ['indiamart', 'google-sheets', 'email'],
  },
]

/** Directory entries that have their own page elsewhere on the site. */
export const directoryExtras = [
  {
    slug: 'website-forms',
    href: '/form-backend',
    name: 'Website forms',
    kind: 'Lead source' as IntegrationKind,
    summary: 'Plain HTML, Webflow, WordPress or Framer forms, with a spam trap and a thank-you page.',
  },
  {
    slug: 'mcp',
    href: '/mcp',
    name: 'AI agents (MCP)',
    kind: 'Data out' as IntegrationKind,
    summary: 'Claude and other MCP clients search leads, import lists and run campaigns.',
  },
]

export function integrationHref(slug: string) {
  const extra = directoryExtras.find((e) => e.slug === slug)
  return extra ? extra.href : `/integrations/${slug}`
}

export function integrationName(slug: string) {
  return integrations.find((i) => i.slug === slug)?.name ?? directoryExtras.find((e) => e.slug === slug)?.name ?? slug
}

export function integrationSummary(slug: string) {
  return (
    integrations.find((i) => i.slug === slug)?.summary ?? directoryExtras.find((e) => e.slug === slug)?.summary ?? ''
  )
}
