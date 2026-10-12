import { Building2, CreditCard } from 'lucide-react'
export const SETTINGS_SECTIONS = [
  {
    id: 'workspace',
    to: '/settings/workspace',
    label: 'Workspace',
    description: 'Business identity, contact details and workspace defaults.',
    icon: Building2,
  },
  {
    id: 'commerce',
    to: '/settings/commerce',
    label: 'Payments & suppliers',
    description: 'Payment fees and fulfilment partners for your orders.',
    icon: CreditCard,
  },
] as const
export const SETTINGS_GROUPS = [{ label: 'Workspace settings', ids: ['workspace', 'commerce'] }]
export type SettingsSection = (typeof SETTINGS_SECTIONS)[number]
