import { NavLink, useLocation } from 'react-router-dom'
import { useAuthStore } from '@/stores/auth-store'
import { useUIStore } from '@/stores/ui-store'
import { ROLE_EXPERIENCE } from '@/lib/role-shell'
import { cn } from '@/lib/utils'
import {
  Package,
  Package2,
  Contact,
  TrendingUp,
  LayoutDashboard,
  MessageSquare,
  Users,
  BarChart3,
  Kanban,
  UserCog,
  Megaphone,
  FileText,
  Upload,
  Radio,
  Settings,
  History,
  PanelLeftClose,
  PanelLeftOpen,
  X,
} from 'lucide-react'
import type { LucideIcon } from 'lucide-react'
import { BrandMark } from './brand-mark'

type NavItem = {
  to: string
  label: string
  icon: LucideIcon
  capability: string
}

const NAV_ITEMS: NavItem[] = [
  { to: '/overview', label: 'Overview', icon: LayoutDashboard, capability: 'page.overview' },
  { to: '/inbox', label: 'Inbox', icon: MessageSquare, capability: 'page.inbox' },
  { to: '/leads', label: 'Leads', icon: Users, capability: 'page.leads' },
  { to: '/pipeline', label: 'Pipeline', icon: Kanban, capability: 'page.pipeline' },
  { to: '/orders', label: 'Orders', icon: Package, capability: 'page.orders' },
  { to: '/products', label: 'Products', icon: Package2, capability: 'page.products' },
  { to: '/customers', label: 'Customers', icon: Contact, capability: 'page.customers' },
  { to: '/revenue', label: 'Revenue', icon: TrendingUp, capability: 'page.revenue' },
  { to: '/campaigns', label: 'Campaigns', icon: Megaphone, capability: 'page.campaigns' },
  { to: '/templates', label: 'Templates', icon: FileText, capability: 'page.templates' },
  { to: '/import', label: 'Import', icon: Upload, capability: 'page.import' },
  { to: '/analytics', label: 'Analytics', icon: BarChart3, capability: 'page.analytics' },
  { to: '/team', label: 'Team', icon: UserCog, capability: 'page.team' },
  { to: '/activity', label: 'Activity', icon: History, capability: 'page.activity' },
  { to: '/integrations', label: 'Integrations', icon: Radio, capability: 'page.integrations' },
  { to: '/settings', label: 'Settings', icon: Settings, capability: 'page.settings' },
]

/**
 * Nav sections, in the order the work happens: talk to people, sell to them,
 * grow the top of the funnel, then configure the machine.
 *
 * An item renders ONLY if it appears in a group here — being in NAV_ITEMS is
 * not enough. Orders, Customers and Revenue were added to NAV_ITEMS without a
 * group and were therefore invisible in the sidebar, reachable only by typing
 * the URL. If you add a nav item, add its route to a group too.
 */
const NAV_GROUPS: Array<{ label: string; routes: string[] }> = [
  { label: 'Operate', routes: ['/overview', '/inbox', '/leads', '/pipeline'] },
  { label: 'Sell', routes: ['/orders', '/products', '/customers', '/revenue'] },
  { label: 'Grow', routes: ['/campaigns', '/templates', '/import', '/analytics'] },
  { label: 'Configure', routes: ['/team', '/integrations', '/activity', '/settings'] },
]

/** Every nav item must live in a group, or it silently will not render. */
const GROUPED_ROUTES = new Set(NAV_GROUPS.flatMap((g) => g.routes))

if (import.meta.env.DEV) {
  const orphans = NAV_ITEMS.filter((i) => !GROUPED_ROUTES.has(i.to)).map((i) => i.to)
  if (orphans.length) {
    console.error(
      `[sidebar] nav items missing from NAV_GROUPS, so they will not render: ${orphans.join(', ')}`,
    )
  }
}

export function Sidebar() {
  const { hasCapability, user } = useAuthStore()
  const { sidebarCollapsed, isMobileViewport, toggleSidebar, setSidebarCollapsed } = useUIStore()
  const location = useLocation()
  const role = user?.role || 'viewer'
  const experience = ROLE_EXPERIENCE[role]
  const navOrder = new Map(experience.navOrder.map((route, index) => [route, index]))

  const visibleItems = NAV_ITEMS.filter((item) => hasCapability(item.capability)).sort(
    (left, right) => (navOrder.get(left.to) ?? 999) - (navOrder.get(right.to) ?? 999),
  )

  // `sidebarCollapsed` does double duty: on desktop it means the icon rail, on
  // mobile it means the drawer is closed (and the drawer is always full width).
  const isRail = sidebarCollapsed && !isMobileViewport

  return (
    <aside
      className={cn(
        'fixed inset-y-0 left-0 z-40 flex flex-col border-r border-border bg-surface',
        'transition-[width,transform] duration-200 ease-out',
        'w-60',
        sidebarCollapsed ? '-translate-x-full lg:w-14 lg:translate-x-0' : 'translate-x-0',
      )}
    >
      {/* Brand */}
      <div
        className={cn(
          'flex h-12 shrink-0 items-center border-b border-border',
          isRail ? 'justify-center px-0' : 'gap-2.5 px-3',
        )}
      >
        <BrandMark className="h-6 w-6 shrink-0 text-text-primary" />
        {!isRail && (
          <>
            <span className="truncate text-sm font-semibold tracking-tight">Outbound OS</span>
            {isMobileViewport && (
              <button
                type="button"
                onClick={() => setSidebarCollapsed(true)}
                aria-label="Close navigation"
                className="ml-auto rounded-md p-1.5 text-text-muted transition-colors hover:bg-surface-raised hover:text-text-primary"
              >
                <X className="h-4 w-4" />
              </button>
            )}
          </>
        )}
      </div>

      {/* Navigation */}
      <nav className="flex-1 overflow-y-auto px-2 py-3">
        <div className="space-y-5">
          {NAV_GROUPS.map((group) => {
            const groupItems = visibleItems.filter((item) => group.routes.includes(item.to))
            if (!groupItems.length) return null

            return (
              <div key={group.label}>
                {!isRail && (
                  <p className="px-2 pb-1.5 text-[10px] font-semibold uppercase tracking-[0.12em] text-text-muted">
                    {group.label}
                  </p>
                )}
                <ul className="space-y-px">
                  {groupItems.map((item) => {
                    const Icon = item.icon
                    const isActive = location.pathname.startsWith(item.to)

                    return (
                      <li key={item.to}>
                        <NavLink
                          to={item.to}
                          onClick={() => {
                            if (isMobileViewport) setSidebarCollapsed(true)
                          }}
                          aria-current={isActive ? 'page' : undefined}
                          className={cn(
                            'relative flex h-8 items-center rounded-md text-[13px] transition-colors',
                            isRail ? 'justify-center px-0' : 'gap-2.5 px-2',
                            isActive
                              ? 'bg-surface-raised font-medium text-text-primary'
                              : 'font-normal text-text-secondary hover:bg-surface-raised hover:text-text-primary',
                          )}
                          title={isRail ? item.label : undefined}
                        >
                          {/* A 2px ink rule marks the active row — grouped nav
                              scans faster with a positional cue than colour alone. */}
                          {isActive && (
                            <span
                              aria-hidden="true"
                              className="absolute bottom-1.5 left-0 top-1.5 w-0.5 rounded-full bg-accent"
                            />
                          )}
                          <Icon className="h-4 w-4 shrink-0" />
                          {!isRail && <span className="truncate">{item.label}</span>}
                        </NavLink>
                      </li>
                    )
                  })}
                </ul>
              </div>
            )
          })}
        </div>
      </nav>

      {/* Engine status + collapse */}
      <div
        className={cn(
          'flex h-11 shrink-0 items-center border-t border-border',
          isRail ? 'justify-center px-0' : 'gap-2 px-3',
        )}
      >
        {!isRail && (
          <span className="flex min-w-0 items-center gap-2 text-[11px] text-text-muted">
            <span className={cn('h-1.5 w-1.5 shrink-0 rounded-full', 'bg-success')} />
            <span className="truncate">Engine running</span>
          </span>
        )}
        <button
          type="button"
          onClick={toggleSidebar}
          aria-expanded={!sidebarCollapsed}
          aria-label={sidebarCollapsed ? 'Expand navigation' : 'Collapse navigation'}
          title={sidebarCollapsed ? 'Expand navigation' : 'Collapse navigation'}
          className={cn(
            'hidden rounded-md p-1.5 text-text-muted transition-colors hover:bg-surface-raised hover:text-text-primary lg:inline-flex',
            !isRail && 'ml-auto',
          )}
        >
          {sidebarCollapsed ? (
            <PanelLeftOpen className="h-4 w-4" />
          ) : (
            <PanelLeftClose className="h-4 w-4" />
          )}
        </button>
      </div>
    </aside>
  )
}
