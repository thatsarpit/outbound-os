import { Link } from 'react-router-dom'
import { useQuery } from '@tanstack/react-query'
import type { LucideIcon } from 'lucide-react'
import {
  Bot,
  ArrowUpRight,
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
import { inboxApi } from '@/api/endpoints/inbox'
import type { InboxChannelHealth, InboxChannel } from '@/api/types'
import { CHANNEL_ORDER, formatChannelHealthDetail } from '@/lib/channels'
import { cn } from '@/lib/utils'

type Integration = {
  name: string
  detail: string
  icon: LucideIcon
  to: string
  /** Reads connected-ness from the onboarding status; omitted = no status shown. */
  connected?: (status: OnboardingStatus) => boolean
  channel?: InboxChannel
  action?: string
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
    blurb: 'Messaging accounts and reply connections for your shared inbox.',
    items: [
      {
        name: 'WhatsApp',
        detail: "Meta's official Cloud API. Approved templates for first contact.",
        icon: MessageSquare,
        to: '/integrations/whatsapp',
        channel: 'whatsapp',
        connected: (s) => s.channels.whatsapp,
      },
      {
        name: 'Email',
        detail: 'Any SMTP/IMAP mailbox or Brevo, with reply sync and bounce handling.',
        icon: Mail,
        to: '/integrations/email',
        channel: 'email',
        connected: (s) => s.channels.email,
      },
      {
        name: 'Telegram',
        detail: 'Your own Telegram account for one-to-one conversations.',
        icon: Send,
        to: '/integrations/telegram',
        channel: 'telegram',
        connected: (s) => s.channels.telegram,
      },
      {
        name: 'iMessage',
        detail: 'Through a Mac running BlueBubbles.',
        icon: MessageCircle,
        to: '/integrations/imessage',
        channel: 'imessage',
        connected: (s) => s.channels.imessage,
      },
    ],
  },
  {
    title: 'Bring leads in',
    blurb: 'Capture leads from forms, imports and external tools.',
    items: [
      {
        name: 'Website forms',
        detail: 'Plain HTML, Webflow, WordPress, Framer — post a form straight in.',
        icon: Globe,
        to: '/integrations/webhooks',
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
        detail: 'external marketplaces, TradeIndia, JustDial and Engyne Cloud presets.',
        icon: Store,
        to: '/integrations/webhooks',
      },
      {
        name: 'CSV import',
        detail: 'Bring a list from another CRM. Existing contacts are deduplicated.',
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
    ],
  },
  {
    title: 'Work with AI',
    blurb: 'Bring this workspace into the AI agent you already use.',
    items: [
      {
        name: 'AI agents & MCP',
        detail:
          'Connect ChatGPT, Codex, Claude or another agent. Copy the server URL and follow guided setup.',
        icon: Bot,
        to: '/integrations/mcp',
        action: 'Connect an AI agent',
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

  const { data: health, isError: healthError } = useQuery({
    queryKey: ['inbox-channel-health'],
    queryFn: inboxApi.channelHealth,
    refetchInterval: 60_000,
    meta: { silent: true },
  })
  const readyCount = health
    ? CHANNEL_ORDER.filter((channel) => health[channel].status === 'ready').length
    : null

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-center justify-between gap-4 rounded-lg border border-border bg-surface px-5 py-4">
        <div>
          <h2 className="text-sm font-semibold text-text-primary">Your connected workspace</h2>
          <p className="mt-1 text-xs leading-5 text-text-secondary">
            Manage channel accounts, inbox connections, and data sources in one place.
          </p>
        </div>
        <span className="rounded-full border border-border px-3 py-1.5 text-xs text-text-secondary">
          {readyCount !== null
            ? `${readyCount} of 4 messaging channels ready`
            : healthError
              ? 'Channel status unavailable'
              : 'Checking channel health…'}
        </span>
      </div>
      {GROUPS.map((group) => (
        <section key={group.title} aria-labelledby={`group-${group.title}`}>
          <h2
            id={`group-${group.title}`}
            className="text-sm font-semibold tracking-tight text-text-primary"
          >
            {group.title}
          </h2>
          <p className="mt-0.5 text-[12px] text-text-secondary">{group.blurb}</p>
          <div className="mt-3 grid gap-3 sm:grid-cols-2 2xl:grid-cols-3">
            {group.items.map((item) => (
              <IntegrationCard
                key={item.name}
                item={item}
                status={status || undefined}
                health={health || undefined}
                healthError={healthError}
              />
            ))}
          </div>
        </section>
      ))}
    </div>
  )
}

function IntegrationCard({
  item,
  status,
  health,
  healthError,
}: {
  item: Integration
  status?: OnboardingStatus
  health?: InboxChannelHealth
  healthError: boolean
}) {
  const Icon = item.icon
  const channel = item.channel && health?.[item.channel]
  const configured = status && item.connected ? item.connected(status) : false
  const label = item.channel
    ? channel
      ? { ready: 'Ready', limited: 'Limited', offline: 'Offline' }[channel.status]
      : healthError
        ? 'Unavailable'
        : 'Checking…'
    : item.connected
      ? status
        ? configured
          ? 'Configured'
          : 'Not configured'
        : 'Checking…'
      : null
  const tone =
    channel?.status === 'ready'
      ? 'bg-success-muted text-success'
      : channel?.status === 'offline'
        ? 'bg-danger-muted text-danger'
        : channel?.status === 'limited'
          ? 'bg-warning-muted text-warning'
          : 'bg-surface-raised text-text-muted'
  const external = item.to.startsWith('http')
  const className =
    'group flex h-full min-w-0 flex-col rounded-lg border border-border bg-surface p-4 transition-colors hover:border-border-strong hover:bg-surface-raised focus-visible:outline focus-visible:outline-2 focus-visible:outline-accent'
  const body = (
    <>
      <span className="flex items-start justify-between gap-2">
        <span className="flex h-9 w-9 items-center justify-center rounded-md border border-border bg-background">
          <Icon aria-hidden="true" className="h-4 w-4 text-text-secondary" />
        </span>
        {label && (
          <span className={cn('rounded-full px-2 py-0.5 text-[10px] font-medium', tone)}>
            {label}
          </span>
        )}
      </span>
      <span className="mt-3 text-sm font-semibold text-text-primary">{item.name}</span>
      <span className="mt-1 flex-1 text-xs leading-5 text-text-secondary">{item.detail}</span>
      {channel && channel.status !== 'ready' && (
        <span className="mt-2 text-[11px] leading-4 text-text-muted">
          {formatChannelHealthDetail(channel.detail)}
        </span>
      )}
      <span className="mt-4 inline-flex items-center gap-1 text-xs font-medium text-text-primary">
        {item.action || (external ? 'View documentation' : 'Manage connection')}{' '}
        <ArrowUpRight aria-hidden="true" className="h-3 w-3" />
      </span>
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
