import { NavLink, useLocation } from 'react-router-dom'
import { useAuthStore } from '@/stores/auth-store'
import { useUIStore } from '@/stores/ui-store'
import { cn } from '@/lib/utils'
import { NAVIGATION_GROUPS } from '@/lib/navigation'
import { PanelLeftClose, PanelLeftOpen, X } from 'lucide-react'
import { BrandMark } from './brand-mark'
import { useQuery } from '@tanstack/react-query'
import { systemApi } from '@/api/endpoints/system'

export function Sidebar() {
  const { hasCapability, dashboardScope, isManagerOrAbove } = useAuthStore()
  const canViewHealth = isManagerOrAbove()
  const { sidebarCollapsed, isMobileViewport, toggleSidebar, setSidebarCollapsed } = useUIStore()
  const location = useLocation()
  const { data: health, isError: healthError } = useQuery({
    queryKey: ['system-health', dashboardScope],
    enabled: canViewHealth,
    queryFn: () => systemApi.getHealth(),
    refetchInterval: 60_000,
    staleTime: 30_000,
    meta: { silent: true },
  })
  const overall = canViewHealth && !healthError ? health?.health?.overall : null
  const healthLabel = !canViewHealth
    ? 'Sales workspace'
    : healthError
      ? 'Status unavailable'
      : overall === 'ok'
        ? 'System healthy'
        : overall === 'down'
          ? 'System issue'
          : overall === 'degraded'
            ? 'Needs attention'
            : 'Checking system'

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
      <nav aria-label="Main navigation" className="flex-1 overflow-y-auto px-2 py-3">
        <div className="space-y-4">
          {NAVIGATION_GROUPS.map((group) => {
            const groupItems = group.items.filter((item) => hasCapability(item.capability))
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
            <span
              className={cn(
                'h-1.5 w-1.5 shrink-0 rounded-full',
                overall === 'ok'
                  ? 'bg-success'
                  : overall === 'down'
                    ? 'bg-danger'
                    : overall === 'degraded' || healthError
                      ? 'bg-warning'
                      : 'bg-text-muted',
              )}
            />
            <span className="truncate">{healthLabel}</span>
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
