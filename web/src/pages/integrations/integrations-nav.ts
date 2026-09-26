import { Mail, MessageSquare, Send, Sheet, Webhook } from 'lucide-react'

/**
 * Channel catalog for the /integrations/* sub-routes.
 */
export const INTEGRATION_TABS = [
  {
    id: 'whatsapp',
    to: '/integrations/whatsapp',
    label: 'WhatsApp',
    description: 'Your WhatsApp numbers, how each one connects, and delivery health.',
    icon: MessageSquare,
  },
  {
    id: 'email',
    to: '/integrations/email',
    label: 'Email',
    description: 'Outbound inboxes, provider settings, and send-side hygiene.',
    icon: Mail,
  },
  {
    id: 'telegram',
    to: '/integrations/telegram',
    label: 'Telegram',
    description: 'Connect a Telegram user account for deliberate one-to-one messages.',
    icon: Send,
  },
  {
    id: 'webhooks',
    to: '/integrations/webhooks',
    label: 'Webhooks',
    description: 'Inbound sources that feed leads into the workspace.',
    icon: Webhook,
  },
  {
    id: 'sheets',
    to: '/integrations/sheets',
    label: 'Google Sheets',
    description: 'Push lead events to a Google Sheet in real time via a webhook URL.',
    icon: Sheet,
  },
] as const

export type IntegrationTab = (typeof INTEGRATION_TABS)[number]
