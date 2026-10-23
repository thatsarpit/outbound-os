import {
  Bot,
  LayoutGrid,
  Mail,
  MessageSquare,
  Smartphone,
  Send,
  Sheet,
  Webhook,
} from 'lucide-react'

/**
 * Channel catalog for the /integrations/* sub-routes.
 */
export const INTEGRATION_TABS = [
  {
    id: 'all',
    to: '/integrations/all',
    label: 'All integrations',
    description: 'Everything Outbound OS connects to: channels, lead sources and data exports.',
    icon: LayoutGrid,
  },
  {
    id: 'mcp',
    to: '/integrations/mcp',
    label: 'AI agents & MCP',
    description:
      'Connect your AI client to this workspace, check the server and follow guided setup.',
    icon: Bot,
  },
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
    id: 'imessage',
    to: '/integrations/imessage',
    label: 'iMessage',
    description: 'Mac connections through BlueBubbles, delivery limits and connection health.',
    icon: Smartphone,
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
    label: 'Lead sources & webhooks',
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
