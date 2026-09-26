import { Building2, CreditCard, Mail, MessageSquare, Smartphone } from 'lucide-react'

/**
 * Section catalog for the Settings sub-routes. The layout renders these as
 * NavLinks; each section page owns the matching route in App.tsx.
 */
export const SETTINGS_SECTIONS = [
  {
    id: 'workspace',
    to: '/settings/workspace',
    label: 'Workspace',
    description: 'Brand, sender identity, and global defaults',
    icon: Building2,
  },
  {
    id: 'whatsapp',
    to: '/settings/whatsapp',
    label: 'WhatsApp',
    description: 'Accounts, sending limits, and routing',
    icon: Smartphone,
  },
  {
    id: 'email',
    to: '/settings/email',
    label: 'Email Accounts',
    description: 'Senders, and which brand each one writes as',
    icon: Mail,
  },
  {
    id: 'imessage',
    to: '/settings/imessage',
    label: 'iMessage',
    description: 'BlueBubbles-backed Mac servers for iMessage outreach',
    icon: MessageSquare,
  },
  {
    id: 'commerce',
    to: '/settings/commerce',
    label: 'Payments & Suppliers',
    description: 'Payment fees and who fulfils each order',
    icon: CreditCard,
  },
] as const

/**
 * Settings sections, grouped by what you are configuring: the business
 * itself, the channels it sends through, and how orders are fulfilled.
 *
 * A section renders only if its id appears here — the same rule the main
 * sidebar follows, and the same trap: an ungrouped section is invisible.
 * SETTINGS_GROUP_CHECK below fails loudly in dev if one is missed.
 */
export const SETTINGS_GROUPS: Array<{ label: string; ids: string[] }> = [
  { label: 'Business', ids: ['workspace'] },
  { label: 'Channels', ids: ['whatsapp', 'email', 'imessage'] },
  { label: 'Commerce', ids: ['commerce'] },
]

if (import.meta.env.DEV) {
  const grouped = new Set(SETTINGS_GROUPS.flatMap((g) => g.ids))
  const orphans = SETTINGS_SECTIONS.filter((s) => !grouped.has(s.id)).map((s) => s.id)
  if (orphans.length) {
    console.error(
      `[settings] sections missing from SETTINGS_GROUPS, so they will not render: ${orphans.join(', ')}`,
    )
  }
}

export type SettingsSection = (typeof SETTINGS_SECTIONS)[number]
