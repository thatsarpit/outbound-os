/* ════════════════════════════════════════════════════════════════════════════
   ALTERNATIVES

   Comparisons with hosted WhatsApp platforms. The rule for these pages: say
   only what each vendor's own website says about itself (checked September
   2026), never quote their prices, and state plainly where they are the
   better choice. A comparison page that only flatters us is not believed.
════════════════════════════════════════════════════════════════════════════ */

export type Alternative = {
  slug: string
  name: string
  title: string
  description: string
  h1: string
  intro: string
  /** What the vendor is, in their own terms. */
  theyAre: string
  /** Channels the vendor advertises besides WhatsApp. */
  theirChannels: string
  /** Features the vendor advertises that Outbound OS does not have. */
  theirStrengths: string[]
  /** Extra comparison rows specific to this vendor. */
  extraRows?: [aspect: string, ours: string, theirs: string][]
  chooseThem: string[]
  chooseUs: string[]
  /** Optional note on using both together. */
  together?: string
  faq: { q: string; a: string }[]
}

export const alternatives: Alternative[] = [
  {
    slug: 'wati',
    name: 'Wati',
    title: 'Open-source Wati alternative — self-hosted WhatsApp CRM',
    description:
      'Outbound OS vs Wati: a free, open-source WhatsApp CRM you host yourself, compared fairly with Wati’s hosted platform — including when Wati is the better choice.',
    h1: 'An open-source alternative to Wati.',
    intro:
      'Wati is a hosted WhatsApp Business platform with a team inbox, campaigns and a no-code chatbot builder. Outbound OS is open-source software you run on your own server, built around capturing leads and following up until they reply. They overlap on the inbox and campaigns and differ on almost everything else.',
    theyAre: 'Hosted WhatsApp Business platform (SaaS) with subscription plans',
    theirChannels: 'Instagram, Facebook, website chat and SMS, per their website',
    theirStrengths: [
      'No-code chatbot builder and AI agents',
      'Click-to-WhatsApp ad tools',
      'WhatsApp Business calling',
      'A library of 100+ integrations',
    ],
    chooseThem: [
      'You want a chatbot builder to answer customers automatically',
      'You would rather pay a subscription than run a server',
      'You need vendor support and a hosted uptime commitment',
      'Instagram DMs and website chat matter as much as WhatsApp',
    ],
    chooseUs: [
      'You want leads and conversations in your own database',
      'You do not want a per-seat or per-plan subscription',
      'Leads arrive from forms, ads and marketplaces like IndiaMART and must be contacted in seconds',
      'Follow-ups should run across WhatsApp and email, and stop on reply',
      'You want to read and change the code, or let AI agents work the CRM over MCP',
    ],
    faq: [
      {
        q: 'Is there a free alternative to Wati?',
        a: 'Outbound OS is free and open source. You host it yourself and connect your number through Meta’s WhatsApp Cloud API, paying Meta directly for messages. It does not include a chatbot builder, so it suits outbound follow-up more than automated support.',
      },
      {
        q: 'Can I move my WhatsApp number from Wati to Outbound OS?',
        a: 'A number can only be connected to one WhatsApp Business API setup at a time. Moving means migrating the number to your own Meta app; Meta documents the migration, and your approved templates may need to be re-submitted. Plan it for a quiet day.',
      },
      {
        q: 'Does Outbound OS have a chatbot?',
        a: 'No. It sends your approved templates and follow-up sequences automatically, and people reply from a shared inbox. Automated conversation flows are not part of it.',
      },
    ],
  },
  {
    slug: 'aisensy',
    name: 'AiSensy',
    title: 'AiSensy alternative — or use AiSensy inside an open-source CRM',
    description:
      'Outbound OS vs AiSensy: an open-source, self-hosted WhatsApp CRM compared fairly with AiSensy — and how to keep your AiSensy number and use both together.',
    h1: 'An AiSensy alternative — that also works with AiSensy.',
    intro:
      'AiSensy is a hosted WhatsApp marketing platform and an official WhatsApp Business Solution Provider, with broadcasts, a chatbot flow builder and click-to-WhatsApp ads. Outbound OS is an open-source CRM you host yourself. Unusually for a comparison, you do not have to pick one: Outbound OS can send through your AiSensy number.',
    theyAre: 'Hosted WhatsApp platform (SaaS) and official WhatsApp Business Solution Provider',
    theirChannels: 'WhatsApp-focused, with WhatsApp forms, catalog and payments, per their website',
    theirStrengths: [
      'Drag-and-drop chatbot flow builder',
      'Click-to-WhatsApp ads for Facebook and Instagram',
      'WhatsApp catalog and payments',
      'Onboarding to the WhatsApp Business API as a BSP',
    ],
    extraRows: [['Works with the other', 'Yes — AiSensy is a built-in provider', 'Not applicable']],
    chooseThem: [
      'Broadcasts and chatbot flows are most of what you need',
      'You want WhatsApp catalog and payments',
      'You would rather not run a server',
    ],
    chooseUs: [
      'You want a CRM around your WhatsApp: pipeline, owners, notes, tasks and orders',
      'Leads from websites, ads and IndiaMART should be contacted in seconds, automatically',
      'You want email, Telegram and iMessage on the same lead',
      'Your leads should live in your own database',
    ],
    together:
      'Keep your number on AiSensy and choose AiSensy as its provider in Outbound OS. Templates go out through AiSensy’s API campaigns, free-text replies through its Project API, and replies come back through a signed webhook.',
    faq: [
      {
        q: 'Can I use AiSensy and Outbound OS together?',
        a: 'Yes. AiSensy is a supported WhatsApp provider in Outbound OS, chosen per number. You keep your AiSensy account and templates; Outbound OS adds lead capture, instant first contact, follow-ups that stop on reply, and a CRM.',
      },
      {
        q: 'What do I need from AiSensy?',
        a: 'Your API Campaign key for template messages, an API campaign for each template you want to send, and — for free-text replies from the inbox — the Project API credentials, which AiSensy offers on its Pro plan.',
      },
      {
        q: 'Is Outbound OS an AiSensy alternative in India?',
        a: 'Yes. It was first built for an Indian export business, connects to IndiaMART, TradeIndia and JustDial lead webhooks, and supports INR as the home currency.',
      },
    ],
  },
  {
    slug: 'interakt',
    name: 'Interakt',
    title: 'Interakt alternative — open-source WhatsApp CRM',
    description:
      'Outbound OS vs Interakt: a free, open-source WhatsApp CRM you host yourself, compared fairly with Interakt’s hosted platform, including where Interakt fits better.',
    h1: 'An open-source alternative to Interakt.',
    intro:
      'Interakt is a hosted WhatsApp and Instagram platform with marketing, support and a WhatsApp-first sales CRM, plus chatbots and WhatsApp commerce. Outbound OS is open-source software you host, focused on getting every lead contacted in seconds and followed up until they reply.',
    theyAre: 'Hosted WhatsApp and Instagram platform (SaaS) with subscription plans',
    theirChannels: 'Instagram, with RCS fallback, per their website',
    theirStrengths: [
      'No-code chatbots and AI agents',
      'WhatsApp store, catalog and payments with Shopify and WooCommerce sync',
      'Instagram automation',
      'RCS fallback messaging',
    ],
    chooseThem: [
      'You sell through a Shopify or WooCommerce store and want WhatsApp commerce',
      'Chatbots should answer customers without a person',
      'You would rather not run a server',
    ],
    chooseUs: [
      'You sell B2B and your leads come from forms, ads and marketplaces',
      'You want follow-ups across WhatsApp and email that stop on reply',
      'Your data should live on your own server, with no subscription',
      'You want to change the code or connect AI agents over MCP',
    ],
    faq: [
      {
        q: 'Is Outbound OS free?',
        a: 'Yes, under the AGPL-3.0 license. You pay for your own server and for WhatsApp messages, which Meta bills to your own WhatsApp Business account.',
      },
      {
        q: 'Does Outbound OS support Instagram?',
        a: 'No. It covers WhatsApp, email, Telegram and iMessage. Instagram DMs are not supported.',
      },
    ],
  },
]

export function alternativeBySlug(slug: string) {
  return alternatives.find((a) => a.slug === slug)
}
