/* ════════════════════════════════════════════════════════════════════════════
   SITE CONTENT

   Navigation and shared copy live here so a page never invents its own label
   for something that already has one. If a name changes, it changes once.
════════════════════════════════════════════════════════════════════════════ */

export const siteUrl = 'https://outboundos.space'

/** When the site's product copy was last checked against the code. Shown on
    docs pages and used as dateModified in structured data. */
export const contentUpdated = '2026-09-28'

export const site = {
  name: 'Outbound OS',
  /* What the product is, in one sentence. Used in metadata and anywhere the
     site has to introduce itself cold. */
  description:
    'Outbound OS is an open-source, self-hosted WhatsApp CRM and outreach platform. Capture leads from forms, ads and marketplaces, contact them in seconds on WhatsApp, email, Telegram and iMessage, and follow up until they reply.',
  shortDescription: 'Open-source WhatsApp CRM and outreach platform you host yourself.',
  tagline: 'Every lead contacted in seconds. Every follow-up on time. On your own server.',
  githubUrl: 'https://github.com/thatsarpit/outbound-os',
  githubRepo: 'thatsarpit/outbound-os',
  releasesUrl: 'https://github.com/thatsarpit/outbound-os/releases',
  discussionsUrl: 'https://github.com/thatsarpit/outbound-os/discussions',
  license: 'AGPL-3.0',
  licenseUrl: 'https://github.com/thatsarpit/outbound-os/blob/main/LICENSE',
  version: '0.2.0',
  /**
   * The live demo: the real dashboard on sample data, no sign-in. A redirect
   * in public/_redirects, so where the demo is hosted can change without
   * touching a link. A plain <a>, never next/link: /demo is not a page here.
   */
  demoUrl: '/demo',
  /** The hosted instance the Outbound OS team runs for managed customers. */
  appUrl: 'https://app.outboundos.space',
  /**
   * Where the managed-hosting enquiry form posts. Inlined at build time by
   * Next, so it must be set in the build environment. If it is wrong or the
   * API is unreachable the form falls back to mailto rather than losing it.
   */
  apiUrl: process.env.NEXT_PUBLIC_API_URL || 'https://nexcure.outboundos.space',
  email: 'hello@outboundos.space',
} as const

/**
 * Grouped navigation. The labels describe what a visitor is trying to
 * understand, not an internal module list.
 */
export const navGroups = [
  {
    label: 'Product',
    columns: [
      {
        heading: 'The system',
        links: [
          { label: 'Platform', href: '/platform', description: 'From first enquiry to closed deal, in one loop.' },
          { label: 'Capabilities', href: '/capabilities', description: 'Inbox, sequences, campaigns, pipeline and control.' },
          { label: 'Integrations', href: '/integrations', description: 'Channels, lead sources and data exports.' },
        ],
      },
      {
        heading: 'Built to extend',
        links: [
          { label: 'MCP for AI agents', href: '/mcp', description: 'Let Claude and other agents work your live CRM.' },
          { label: 'Open source', href: '/open-source', description: 'AGPL-3.0, self-hosted, built in public.' },
          { label: 'Roadmap', href: '/roadmap', description: 'Available now, in development and planned.' },
        ],
      },
    ],
  },
  {
    label: 'Solutions',
    columns: [
      {
        heading: 'What you need',
        links: [
          { label: 'WhatsApp CRM', href: '/whatsapp-crm', description: 'A free, open-source CRM built around WhatsApp.' },
          { label: 'Self-hosted CRM', href: '/self-hosted-crm', description: 'Run it on your server with one Docker command.' },
          { label: 'Form backend', href: '/form-backend', description: 'Website forms that reply to the lead for you.' },
        ],
      },
      {
        heading: 'Where leads come from',
        links: [
          { label: 'IndiaMART automation', href: '/integrations/indiamart', description: 'Reply to every IndiaMART enquiry in seconds.' },
          { label: 'Facebook Lead Ads', href: '/integrations/facebook-lead-ads', description: 'Contact ad leads before they forget you.' },
          { label: 'Use cases', href: '/use-cases', description: 'Exporters, distributors, agencies and services.' },
        ],
      },
    ],
  },
  {
    label: 'Resources',
    columns: [
      {
        heading: 'Documentation',
        links: [
          { label: 'Install with Docker', href: '/docs/install', description: 'Running in five minutes on any server.' },
          { label: 'Connect WhatsApp Cloud API', href: '/docs/whatsapp-cloud-api', description: 'Meta setup, step by step.' },
          { label: 'All docs', href: '/docs', description: 'Configuration, forms, MCP, backups.' },
        ],
      },
      {
        heading: 'Compare',
        links: [
          { label: 'Wati alternative', href: '/alternatives/wati', description: 'Hosted WhatsApp platform vs your own.' },
          { label: 'AiSensy alternative', href: '/alternatives/aisensy', description: 'Use it with AiSensy, or without.' },
          { label: 'All comparisons', href: '/alternatives', description: 'How Outbound OS differs, fairly stated.' },
        ],
      },
    ],
  },
] as const

export const directNav = [
  { label: 'Docs', href: '/docs' },
  { label: 'Pricing', href: '/pricing' },
] as const

export const footerNav = [
  {
    heading: 'Product',
    links: [
      { label: 'Platform', href: '/platform' },
      { label: 'Capabilities', href: '/capabilities' },
      { label: 'Integrations', href: '/integrations' },
      { label: 'MCP for AI agents', href: '/mcp' },
      { label: 'Pricing', href: '/pricing' },
      { label: 'Roadmap', href: '/roadmap' },
    ],
  },
  {
    heading: 'Solutions',
    links: [
      { label: 'WhatsApp CRM', href: '/whatsapp-crm' },
      { label: 'Self-hosted CRM', href: '/self-hosted-crm' },
      { label: 'Form backend', href: '/form-backend' },
      { label: 'IndiaMART automation', href: '/integrations/indiamart' },
      { label: 'Use cases', href: '/use-cases' },
    ],
  },
  {
    heading: 'Resources',
    links: [
      { label: 'Documentation', href: '/docs' },
      { label: 'Install with Docker', href: '/docs/install' },
      { label: 'WhatsApp Cloud API setup', href: '/docs/whatsapp-cloud-api' },
      { label: 'Comparisons', href: '/alternatives' },
      { label: 'Changelog', href: 'https://github.com/thatsarpit/outbound-os/blob/main/CHANGELOG.md' },
    ],
  },
  {
    heading: 'Project',
    links: [
      { label: 'GitHub', href: 'https://github.com/thatsarpit/outbound-os' },
      { label: 'Open source', href: '/open-source' },
      { label: 'Security', href: '/security' },
      { label: 'About', href: '/company' },
      { label: 'Managed hosting', href: '/managed-hosting' },
      { label: 'Contact', href: '/contact' },
    ],
  },
] as const

export const legalNav = [
  { label: 'Privacy', href: '/privacy' },
  { label: 'Terms', href: '/terms' },
] as const

/** The shortest honest install, shown wherever the site asks someone to try it. */
export const installCommands = [
  'git clone https://github.com/thatsarpit/outbound-os.git',
  'cd outbound-os',
  'cp .env.example .env',
  'docker compose up -d',
] as const
