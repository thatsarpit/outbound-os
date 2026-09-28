/* ════════════════════════════════════════════════════════════════════════════
   DOCS

   The docs index, sidebar, sitemap and prev/next links all read this list, so
   a new guide is added in one place. Order here is reading order.
════════════════════════════════════════════════════════════════════════════ */

export type Doc = {
  slug: string
  /** Sidebar label. */
  label: string
  /** <title> and H1. */
  title: string
  description: string
  section: 'Get started' | 'Connect' | 'Operate'
}

export const docs: Doc[] = [
  {
    slug: 'install',
    label: 'Install with Docker',
    title: 'Install Outbound OS with Docker',
    description:
      'Install Outbound OS, the open-source WhatsApp CRM, with Docker Compose: clone, set an admin email, start, then put it behind HTTPS. About five minutes.',
    section: 'Get started',
  },
  {
    slug: 'configuration',
    label: 'Configuration',
    title: 'Configuration reference',
    description:
      'Every Outbound OS setting that matters: admin sign-in, business identity, time zone, currency, country code, WhatsApp webhooks, email, encryption and MCP.',
    section: 'Get started',
  },
  {
    slug: 'whatsapp-cloud-api',
    label: 'WhatsApp Cloud API',
    title: 'Connect the WhatsApp Cloud API',
    description:
      "Step-by-step: create a Meta app, get a permanent System User token, connect your number to Outbound OS, receive replies by webhook and set a first-contact template.",
    section: 'Connect',
  },
  {
    slug: 'website-forms',
    label: 'Website forms and webhooks',
    title: 'Website forms and lead webhooks',
    description:
      'Send leads to Outbound OS from HTML forms, Zapier, Make, n8n, IndiaMART or your own code: addresses, keys, field names, field maps, test mode and responses.',
    section: 'Connect',
  },
  {
    slug: 'mcp',
    label: 'MCP server',
    title: 'Set up the MCP server',
    description:
      'Run the Outbound OS MCP server and connect Claude Code or claude.ai to your CRM: tokens, the Docker profile, HTTPS, OAuth and tool approvals.',
    section: 'Connect',
  },
  {
    slug: 'backups-and-upgrades',
    label: 'Backups and upgrades',
    title: 'Backups, restores and upgrades',
    description:
      'What to back up in a self-hosted Outbound OS, how to restore it on a new server, and how to upgrade safely with automatic database migrations.',
    section: 'Operate',
  },
]

export const docSections = ['Get started', 'Connect', 'Operate'] as const

export function docBySlug(slug: string) {
  return docs.find((d) => d.slug === slug)
}
