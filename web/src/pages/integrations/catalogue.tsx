import { Link } from 'react-router-dom'
import { useQuery } from '@tanstack/react-query'
import type { LucideIcon } from 'lucide-react'
import {
  Bot,
  Check,
  FileSpreadsheet,
  Globe,
  Megaphone,
  Mail,
  MessageCircle,
  MessageSquare,
  Send,
  Sheet,
  Store,
  Webhook,
  Workflow,
} from 'lucide-react'
import { onboardingApi, type OnboardingStatus } from '@/api/endpoints/onboarding'
import { cn } from '@/lib/utils'

type Integration = {
  name: string
  detail: string
  icon: LucideIcon
  to: string
  /** Reads connected-ness from the onboarding status; omitted = no status shown. */
  connected?: (status: OnboardingStatus) => boolean
}

type Group = { title: string; blurb: string; items: Integration[] }

/**
 * Everything Outbound OS connects to, on one page, grouped by what it does.
 * Each card goes to the page that sets it up; the connected badge comes from
 * the same status endpoint the setup wizard uses.
 */
const GROUPS: Group[] = [
  {
    title: 'Reach out',
    blurb: 'Where your first message and follow-ups are sent. Replies land in one inbox.',
    items: [
      {
        name: 'WhatsApp',
        detail: "Meta's official Cloud API, or AiSensy. Approved templates for first contact.",
        icon: MessageSquare,
        to: '/settings/whatsapp',
        connected: (s) => s.channels.whatsapp,
      },
      {
        name: 'Email',
        detail: 'Any SMTP/IMAP mailbox or Brevo, with reply sync and bounce handling.',
        icon: Mail,
        to: '/settings/email',
        connected: (s) => s.channels.email,
      },
      {
        name: 'Telegram',
        detail: 'Your own Telegram account for one-to-one conversations.',
        icon: Send,
        to: '/integrations/telegram',
        connected: (s) => s.channels.telegram,
      },
      {
        name: 'iMessage',
        detail: 'Through a Mac running BlueBubbles.',
        icon: MessageCircle,
        to: '/settings/imessage',
        connected: (s) => s.channels.imessage,
      },
    ],
  },
  {
    title: 'Bring leads in',
    blurb: 'Every source gets its own signed web address. New leads are contacted within seconds.',
    items: [
      {
        name: 'Website forms',
        detail: 'Plain HTML, Webflow, WordPress, Framer — post a form straight in.',
        icon: Globe,
        to: '/setup?step=sources',
        connected: (s) => s.counts.leadSources > 0,
      },
      {
        name: 'Zapier, Make, n8n',
        detail: 'Connect any app those tools support with one webhook step.',
        icon: Workflow,
        to: '/integrations/webhooks',
      },
      {
        name: 'Facebook Lead Ads',
        detail: 'Instant-form leads from Meta ads.',
        icon: Megaphone,
        to: '/integrations/webhooks',
      },
      {
        name: 'Marketplaces',
        detail: 'IndiaMART, TradeIndia, JustDial and Engyne Cloud presets.',
        icon: Store,
        to: '/integrations/webhooks',
      },
      {
        name: 'CSV import',
        detail: 'Bring a list from another CRM. Duplicates are merged.',
        icon: FileSpreadsheet,
        to: '/import',
      },
    ],
  },
  {
    title: 'Send data out',
    blurb: 'Keep other tools in step with what happens here.',
    items: [
      {
        name: 'Google Sheets',
        detail: 'A live row for every new lead and reply.',
        icon: Sheet,
        to: '/integrations/sheets',
        connected: (s) => s.integrations.googleSheets,
      },
      {
        name: 'Outgoing webhooks',
        detail: 'Signed events for leads and messages, to any URL.',
        icon: Webhook,
        to: '/integrations/webhooks',
        connected: (s) => s.integrations.outgoingWebhooks,
      },
      {
        name: 'AI clients (MCP)',
        detail: 'Let Claude or any MCP client search leads, import lists and run campaigns.',
        icon: Bot,
        to: 'https://github.com/thatsarpit/outbound-os/tree/main/mcp-outboundos',
        connected: (s) => s.integrations.mcp,
      },
    ],
  },
]

export default function IntegrationCatalogue() {
  const { data: status } = useQuery({
    queryKey: ['onboarding-status'],
    queryFn: () => onboardingApi.status(),
    meta: { silent: true },
  })

  return (
    <div className="space-y-8 pt-2">
      {GROUPS.map((group) => (
        <section key={group.title} aria-labelledby={`group-${group.title}`}>
          <h2 id={`group-${group.title}`} className="text-sm font-semibold tracking-tight text-text-primary">
            {group.title}
          </h2>
          <p className="mt-0.5 text-[12px] text-text-secondary">{group.blurb}</p>
          <div className="mt-3 grid gap-3 sm:grid-cols-2 xl:grid-cols-3">
            {group.items.map((item) => (
              <IntegrationCard key={item.name} item={item} status={status || undefined} />
            ))}
          </div>
        </section>
      ))}
    </div>
  )
}

function IntegrationCard({ item, status }: { item: Integration; status?: OnboardingStatus }) {
  const Icon = item.icon
  const connected = status && item.connected ? item.connected(status) : false
  const external = item.to.startsWith('http')
  const className = cn(
    'group flex h-full flex-col gap-2 rounded-md border p-4 transition-colors',
    connected ? 'border-success/30' : 'border-border hover:border-border-strong hover:bg-surface-raised',
  )
  const body = (
    <>
      <span className="flex items-center justify-between gap-2">
        <span className="flex items-center gap-2 text-sm font-semibold text-text-primary">
          <Icon aria-hidden="true" className="h-4 w-4 text-text-muted" />
          {item.name}
        </span>
        {connected ? (
          <span className="inline-flex items-center gap-1 rounded-full bg-success-muted px-2 py-0.5 text-[11px] font-medium text-success">
            <Check aria-hidden="true" className="h-3 w-3" /> Connected
          </span>
        ) : (
          <span className="text-[11px] font-medium text-accent opacity-0 transition-opacity group-hover:opacity-100">
            {external ? 'Docs →' : 'Set up →'}
          </span>
        )}
      </span>
      <span className="text-[12px] leading-5 text-text-secondary">{item.detail}</span>
    </>
  )
  return external ? (
    <a href={item.to} target="_blank" rel="noreferrer" className={className}>
      {body}
    </a>
  ) : (
    <Link to={item.to} className={className}>
      {body}
    </Link>
  )
}
