/* ════════════════════════════════════════════════════════════════════════════
   ROUTES

   Every indexable page, once. The sitemap, the per-page social images and
   the metadata helper all read this list, so a page cannot exist without a
   sitemap entry and a share card, and a removed page cannot linger in either.
════════════════════════════════════════════════════════════════════════════ */

import { alternatives } from './alternatives'
import { docs } from './docs'
import { integrations } from './integrations'

export type Route = {
  path: string
  /** Share-card eyebrow and headline. Short: the card is read as a thumbnail. */
  eyebrow: string
  headline: string
  priority: number
  changeFrequency: 'weekly' | 'monthly' | 'yearly'
}

const staticRoutes: Route[] = [
  { path: '/', eyebrow: 'Open-source WhatsApp CRM', headline: 'Answer every lead in seconds. Follow up until they reply.', priority: 1, changeFrequency: 'weekly' },
  { path: '/whatsapp-crm', eyebrow: 'WhatsApp CRM', headline: 'The open-source WhatsApp CRM that does the chasing.', priority: 0.9, changeFrequency: 'monthly' },
  { path: '/self-hosted-crm', eyebrow: 'Self-hosted CRM', headline: 'A CRM that runs on your server, not someone else’s.', priority: 0.9, changeFrequency: 'monthly' },
  { path: '/form-backend', eyebrow: 'Form backend', headline: 'A form backend that answers the lead for you.', priority: 0.8, changeFrequency: 'monthly' },
  { path: '/open-source', eyebrow: 'Open source · AGPL-3.0', headline: 'Free to run, free to read, free to change.', priority: 0.8, changeFrequency: 'monthly' },
  { path: '/platform', eyebrow: 'Platform', headline: 'One customer record. Every conversation and next action.', priority: 0.8, changeFrequency: 'monthly' },
  { path: '/capabilities', eyebrow: 'Capabilities', headline: 'Everything from first enquiry to shipped order.', priority: 0.8, changeFrequency: 'monthly' },
  { path: '/integrations', eyebrow: 'Integrations', headline: 'Everything Outbound OS connects to.', priority: 0.9, changeFrequency: 'monthly' },
  { path: '/mcp', eyebrow: 'MCP server', headline: 'Let Claude work your CRM, with a tool for every job.', priority: 0.8, changeFrequency: 'monthly' },
  { path: '/use-cases', eyebrow: 'Use cases', headline: 'Start with the conversation your team keeps losing.', priority: 0.7, changeFrequency: 'monthly' },
  { path: '/pricing', eyebrow: 'Pricing', headline: 'Free. Every feature, every user, every lead.', priority: 0.8, changeFrequency: 'monthly' },
  { path: '/alternatives', eyebrow: 'Comparisons', headline: 'How Outbound OS compares, stated fairly.', priority: 0.7, changeFrequency: 'monthly' },
  { path: '/docs', eyebrow: 'Documentation', headline: 'Install, connect and run Outbound OS.', priority: 0.8, changeFrequency: 'weekly' },
  { path: '/roadmap', eyebrow: 'Roadmap', headline: 'What ships today. What is being built. What is a plan.', priority: 0.6, changeFrequency: 'monthly' },
  { path: '/security', eyebrow: 'Security', headline: 'What the code protects, and what you protect.', priority: 0.6, changeFrequency: 'monthly' },
  { path: '/company', eyebrow: 'About', headline: 'Built to run a real sales desk. Now open source.', priority: 0.5, changeFrequency: 'yearly' },
  { path: '/managed-hosting', eyebrow: 'Managed hosting', headline: 'Rather not run a server? We can run it for you.', priority: 0.6, changeFrequency: 'monthly' },
  { path: '/contact', eyebrow: 'Contact', headline: 'Help, bugs, security and hosting.', priority: 0.4, changeFrequency: 'yearly' },
  { path: '/privacy', eyebrow: 'Legal', headline: 'Privacy', priority: 0.2, changeFrequency: 'yearly' },
  { path: '/terms', eyebrow: 'Legal', headline: 'Terms', priority: 0.2, changeFrequency: 'yearly' },
]

export const routes: Route[] = [
  ...staticRoutes,
  ...integrations.map((i) => ({
    path: `/integrations/${i.slug}`,
    eyebrow: `Integration · ${i.name}`,
    headline: i.h1,
    priority: 0.7,
    changeFrequency: 'monthly' as const,
  })),
  ...alternatives.map((a) => ({
    path: `/alternatives/${a.slug}`,
    eyebrow: `Outbound OS vs ${a.name}`,
    headline: a.h1,
    priority: 0.7,
    changeFrequency: 'monthly' as const,
  })),
  ...docs.map((d) => ({
    path: `/docs/${d.slug}`,
    eyebrow: 'Docs',
    headline: d.title,
    priority: 0.7,
    changeFrequency: 'monthly' as const,
  })),
]

/** File name of a route's share card: '/' → home, '/docs/install' → docs-install. */
export function cardKey(path: string) {
  return path === '/' ? 'home' : path.slice(1).replace(/\//g, '-')
}

export function routeFor(path: string) {
  return routes.find((r) => r.path === path)
}
