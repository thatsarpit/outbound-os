import { useEffect, useMemo, useRef, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { useQuery } from '@tanstack/react-query'
import {
  Search,
  ArrowRight,
  Command as CommandIcon,
  PlusCircle,
  Loader2,
  Megaphone,
  Users,
  Bell,
  ShieldCheck,
  UserRound,
  Upload,
} from 'lucide-react'
import { leadsApi } from '@/api/endpoints/leads'
import { campaignsApi } from '@/api/endpoints/campaigns'
import { useAuthStore } from '@/stores/auth-store'
import { cn } from '@/lib/utils'
import { NAVIGATION_ITEMS } from '@/lib/navigation'
import { INTEGRATION_TABS } from '@/pages/integrations/integrations-nav'
import { SETTINGS_SECTIONS } from '@/pages/settings/settings-nav'

type PaletteItem = {
  id: string
  label: string
  hint?: string
  group: 'Navigate' | 'Leads' | 'Campaigns' | 'Actions'
  icon?: React.ElementType
  keywords?: string[]
  run: () => void
}

type CommandPaletteProps = {
  open: boolean
  onClose: () => void
  onCreateLead?: () => void
  onCreateCampaign?: () => void
}

export function CommandPalette({
  open,
  onClose,
  onCreateLead,
  onCreateCampaign,
}: CommandPaletteProps) {
  const navigate = useNavigate()
  const hasCapability = useAuthStore((s) => s.hasCapability)
  const [query, setQuery] = useState('')
  const [activeIndex, setActiveIndex] = useState(0)
  const listRef = useRef<HTMLDivElement>(null)
  const inputRef = useRef<HTMLInputElement>(null)

  // Reset on open/close
  useEffect(() => {
    if (open) {
      setQuery('')
      setActiveIndex(0)
      setTimeout(() => inputRef.current?.focus(), 10)
    }
  }, [open])

  // Live search — leads
  const { data: leadHits, isFetching: loadingLeads } = useQuery({
    queryKey: ['palette-leads', query],
    queryFn: () => leadsApi.getLeads({ search: query, limit: 6 }),
    enabled: open && hasCapability('page.leads') && query.trim().length >= 2,
    staleTime: 10_000,
  })

  // Search the full campaign collection rather than the first loaded page.
  const { data: campaignList } = useQuery({
    queryKey: ['palette-campaigns', query.trim()],
    queryFn: async () => {
      const res = await campaignsApi.list({ limit: 5, search: query.trim() })
      return Array.isArray(res?.campaigns) ? res.campaigns : []
    },
    enabled: open && hasCapability('page.campaigns') && query.trim().length >= 2,
    staleTime: 30_000,
  })

  const items = useMemo<PaletteItem[]>(() => {
    const list: PaletteItem[] = []

    // Nav routes
    NAVIGATION_ITEMS.filter((r) => hasCapability(r.capability)).forEach((r) => {
      list.push({
        id: `nav:${r.to}`,
        label: `Go to ${r.label}`,
        group: 'Navigate',
        icon: r.icon,
        keywords: [
          r.label.toLowerCase(),
          r.to,
          ...(r.to === '/tasks'
            ? ['follow-ups', 'followups', 'due', 'overdue', 'next action']
            : []),
        ],
        run: () => {
          navigate(r.to)
          onClose()
        },
      })
    })

    if (hasCapability('page.account')) {
      ;[
        {
          route: '/account#profile',
          label: 'Profile',
          hint: 'Your name, photo and verified email',
          icon: UserRound,
          keywords: ['account', 'personal settings', 'avatar'],
        },
        {
          route: '/account#security',
          label: 'Sign-in & security',
          hint: 'Login methods and active sessions',
          icon: ShieldCheck,
          keywords: ['account', 'password', 'sessions', 'passkeys', 'google sign in'],
        },
        {
          route: '/account#notifications',
          label: 'Notification devices',
          hint: 'Push alerts and subscribed devices',
          icon: Bell,
          keywords: ['account', 'iphone', 'push', 'notifications', 'phone alerts'],
        },
      ].forEach((item) =>
        list.push({
          id: `nav:${item.route}`,
          label: `Go to ${item.label}`,
          hint: item.hint,
          group: 'Navigate',
          icon: item.icon,
          keywords: item.keywords,
          run: () => {
            navigate(item.route)
            onClose()
          },
        }),
      )
    }

    if (hasCapability('page.integrations'))
      INTEGRATION_TABS.filter((tab) => tab.id !== 'all').forEach((tab) =>
        list.push({
          id: `nav:${tab.to}`,
          label: `Go to ${tab.label} integration`,
          hint: tab.description,
          group: 'Navigate',
          icon: tab.icon,
          keywords: [
            tab.id,
            'connect',
            'connection',
            ...(tab.id === 'email'
              ? ['gmail', 'outlook', 'brevo', 'smtp', 'imap', 'receiving']
              : []),
            ...(tab.id === 'mcp' ? ['codex', 'chatgpt', 'claude', 'ai authorization'] : []),
          ],
          run: () => {
            navigate(tab.to)
            onClose()
          },
        }),
      )

    if (hasCapability('page.settings'))
      SETTINGS_SECTIONS.forEach((section) =>
        list.push({
          id: `nav:${section.to}`,
          label: `Go to ${section.label} settings`,
          hint: section.description,
          group: 'Navigate',
          icon: section.icon,
          keywords: [section.id, 'configure', 'settings'],
          run: () => {
            navigate(section.to)
            onClose()
          },
        }),
      )

    // Quick actions
    if (hasCapability('page.leads') && onCreateLead) {
      list.push({
        id: 'action:new-lead',
        label: 'New Lead',
        hint: 'Add a lead manually',
        group: 'Actions',
        icon: PlusCircle,
        keywords: ['add lead', 'create lead'],
        run: () => {
          onCreateLead()
          onClose()
        },
      })
    }
    if (hasCapability('page.import'))
      list.push({
        id: 'action:import-leads',
        label: 'Import leads',
        hint: 'Review and import a CSV file',
        group: 'Actions',
        icon: Upload,
        keywords: ['add contacts', 'upload csv', 'new leads'],
        run: () => {
          navigate('/import')
          onClose()
        },
      })
    if (hasCapability('page.campaigns')) {
      list.push({
        id: 'action:new-campaign',
        label: 'Prepare campaign',
        hint: 'Choose a channel, sender and audience before launch',
        group: 'Actions',
        icon: Megaphone,
        keywords: ['create campaign', 'new sequence'],
        run: () => {
          if (onCreateCampaign) onCreateCampaign()
          else navigate('/campaigns?create=1')
          onClose()
        },
      })
    }
    // Lead hits
    if (hasCapability('page.leads'))
      leadHits?.data?.forEach((lead) => {
        list.push({
          id: `lead:${lead.id}`,
          label: lead.name || `Lead #${lead.id}`,
          hint: [lead.company, lead.mobile].filter(Boolean).join(' • '),
          group: 'Leads',
          icon: Users,
          run: () => {
            navigate(`/leads?leadId=${lead.id}`)
            onClose()
          },
        })
      })

    // Campaign hits come from the server-side search.
    if (hasCapability('page.campaigns') && query.trim()) {
      ;(campaignList ?? []).slice(0, 5).forEach((c) => {
        list.push({
          id: `campaign:${c.id}`,
          label: c.name,
          hint: c.description ?? undefined,
          group: 'Campaigns',
          icon: Megaphone,
          run: () => {
            navigate(`/campaigns?id=${c.id}`)
            onClose()
          },
        })
      })
    }

    return list
  }, [
    hasCapability,
    leadHits,
    campaignList,
    query,
    navigate,
    onClose,
    onCreateLead,
    onCreateCampaign,
  ])

  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase()
    if (!q) return items
    return items.filter((it) => {
      const hay = [it.label, it.hint, ...(it.keywords ?? [])]
        .filter(Boolean)
        .join(' ')
        .toLowerCase()
      return hay.includes(q)
    })
  }, [items, query])

  const grouped = useMemo(() => {
    const g: Record<string, PaletteItem[]> = { Actions: [], Navigate: [], Leads: [], Campaigns: [] }
    filtered.forEach((it) => g[it.group].push(it))
    return g
  }, [filtered])

  const flatOrder = useMemo(() => {
    const order: PaletteItem[] = []
    ;(['Actions', 'Navigate', 'Leads', 'Campaigns'] as const).forEach((group) => {
      grouped[group].forEach((it) => order.push(it))
    })
    return order
  }, [grouped])

  useEffect(() => {
    if (activeIndex >= flatOrder.length) setActiveIndex(Math.max(0, flatOrder.length - 1))
  }, [flatOrder.length, activeIndex])

  useEffect(() => {
    if (!open) return
    listRef.current
      ?.querySelector(`[data-command-index="${activeIndex}"]`)
      ?.scrollIntoView({ block: 'nearest' })
  }, [activeIndex, open])

  useEffect(() => {
    if (!open) return
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        onClose()
        return
      }
      if (e.key === 'ArrowDown') {
        e.preventDefault()
        setActiveIndex((i) => Math.max(0, Math.min(flatOrder.length - 1, i + 1)))
      } else if (e.key === 'ArrowUp') {
        e.preventDefault()
        setActiveIndex((i) => Math.max(0, i - 1))
      } else if (e.key === 'Enter') {
        e.preventDefault()
        const item = flatOrder[activeIndex]
        if (item) item.run()
      }
    }
    document.addEventListener('keydown', onKey)
    return () => document.removeEventListener('keydown', onKey)
  }, [open, onClose, flatOrder, activeIndex])

  if (!open) return null

  return (
    <div
      className="fixed inset-0 z-[110] flex items-start justify-center p-4 pt-[14vh] animate-fade-in"
      role="dialog"
      aria-modal="true"
      aria-label="Command palette"
    >
      <button
        type="button"
        aria-label="Close command palette"
        onClick={onClose}
        className="absolute inset-0 bg-black/60 backdrop-blur-sm"
      />

      <div className="relative w-full max-w-xl overflow-hidden rounded-md border border-border bg-surface shadow-2xl animate-slide-up">
        <div className="flex items-center gap-2 border-b border-border px-4 py-3">
          <Search aria-hidden="true" className="h-4 w-4 text-text-muted" />
          <input
            ref={inputRef}
            type="text"
            value={query}
            onChange={(e) => {
              setQuery(e.target.value)
              setActiveIndex(0)
            }}
            placeholder="Search leads, go to a page, run a command…"
            className="flex-1 bg-transparent text-sm text-text-primary placeholder:text-text-muted focus:outline-none"
          />
          {loadingLeads && (
            <Loader2 aria-hidden="true" className="h-4 w-4 animate-spin text-text-muted" />
          )}
          <kbd className="hidden sm:inline-flex items-center gap-1 rounded-md border border-border bg-surface-raised px-1.5 py-0.5 text-[10px] font-semibold text-text-muted">
            ESC
          </kbd>
        </div>

        <div ref={listRef} className="max-h-[60vh] overflow-y-auto px-1 py-2">
          {flatOrder.length === 0 ? (
            <div className="px-4 py-8 text-center text-sm text-text-muted">
              No matches. Try a different search.
            </div>
          ) : (
            (['Actions', 'Navigate', 'Leads', 'Campaigns'] as const).map((group) => {
              const list = grouped[group]
              if (!list.length) return null
              return (
                <div key={group} className="mb-1">
                  <p className="px-3 pb-1 pt-2 text-[10px] font-semibold uppercase tracking-[0.18em] text-text-muted">
                    {group}
                  </p>
                  {list.map((item) => {
                    const idx = flatOrder.indexOf(item)
                    const active = idx === activeIndex
                    const Icon = item.icon
                    return (
                      <button
                        key={item.id}
                        type="button"
                        data-command-index={idx}
                        onMouseEnter={() => setActiveIndex(idx)}
                        onClick={item.run}
                        className={cn(
                          'flex w-full items-center gap-3 rounded-md px-3 py-2 text-left transition-colors',
                          active
                            ? 'bg-accent-muted text-accent'
                            : 'text-text-secondary hover:bg-surface-raised',
                        )}
                      >
                        {Icon && (
                          <span
                            className={cn(
                              'flex h-7 w-7 shrink-0 items-center justify-center rounded-lg',
                              active
                                ? 'bg-accent/15 text-accent'
                                : 'bg-surface-raised text-text-muted',
                            )}
                          >
                            <Icon aria-hidden="true" className="h-4 w-4" />
                          </span>
                        )}
                        <span className="min-w-0 flex-1">
                          <span className="block truncate text-sm font-medium text-text-primary">
                            {item.label}
                          </span>
                          {item.hint && (
                            <span className="block truncate text-xs text-text-muted">
                              {item.hint}
                            </span>
                          )}
                        </span>
                        {active && (
                          <ArrowRight aria-hidden="true" className="h-4 w-4 text-accent" />
                        )}
                      </button>
                    )
                  })}
                </div>
              )
            })
          )}
        </div>

        <div className="flex items-center justify-between gap-2 border-t border-border bg-surface-raised/40 px-4 py-2 text-[11px] text-text-muted">
          <span className="inline-flex items-center gap-1">
            <CommandIcon aria-hidden="true" className="h-3 w-3" /> K to open anywhere
          </span>
          <span className="inline-flex items-center gap-3">
            <span>↑↓ navigate</span>
            <span>↵ select</span>
          </span>
        </div>
      </div>
    </div>
  )
}

/**
 * Hook wiring Cmd+K / Ctrl+K / "/" to toggle the palette.
 * Ignores key events while typing in inputs/textareas.
 */
export function useCommandPaletteHotkey(onToggle: () => void) {
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if ((e.metaKey || e.ctrlKey) && e.key.toLowerCase() === 'k') {
        e.preventDefault()
        onToggle()
      }
    }
    document.addEventListener('keydown', onKey)
    return () => document.removeEventListener('keydown', onKey)
  }, [onToggle])
}
