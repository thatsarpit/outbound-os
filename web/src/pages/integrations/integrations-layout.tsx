import { NavLink, Outlet, useLocation } from 'react-router-dom'
import { cn } from '@/lib/utils'
import { PageHeader } from '@/components/ui/page-header'
import { ErrorBoundary } from '@/components/error-boundary'
import { INTEGRATION_TABS } from './integrations-nav'

/**
 * Layout for the /integrations/* sub-routes: PageHeader + a pill-style channel
 * tab rail (NavLinks) + an Outlet for the active channel page. Each channel
 * renders inside an ErrorBoundary
 * keyed by pathname so one channel's crash stays contained.
 */
export default function IntegrationsLayout() {
  const location = useLocation()
  const tabs = INTEGRATION_TABS
  const canonicalPath = location.pathname.replace(/^\/dev\/shell/, '')
  const active = tabs.find((tab) => canonicalPath.startsWith(tab.to)) ?? tabs[0]

  return (
    <div className="space-y-6 animate-fade-in">
      <PageHeader
        eyebrow="Integrations"
        title={active.id === 'all' ? 'Integrations' : active.label}
        description={active.description}
        breadcrumbs={[{ label: 'Integrations', href: '/integrations' }, { label: active.label }]}
      />

      <div className="grid gap-6 lg:grid-cols-[200px_minmax(0,1fr)]">
        <nav
          aria-label="Integration categories"
          className="flex gap-1 overflow-x-auto lg:sticky lg:top-16 lg:flex-col lg:self-start"
        >
          <p className="hidden px-3 pb-2 text-[10px] font-semibold uppercase tracking-wider text-text-muted lg:block">
            Connections
          </p>
          {tabs.map((tab) => {
            const Icon = tab.icon
            return (
              <NavLink
                key={tab.id}
                to={tab.to}
                className={({ isActive }) =>
                  cn(
                    'flex shrink-0 items-center gap-2 rounded-md px-3 py-2 text-[13px] transition-colors',
                    isActive
                      ? 'bg-surface-raised font-medium text-text-primary'
                      : 'text-text-secondary hover:bg-surface-raised hover:text-text-primary',
                  )
                }
              >
                <Icon className="h-4 w-4 shrink-0" aria-hidden="true" />
                {tab.label}
              </NavLink>
            )
          })}
        </nav>
        <div className="min-w-0">
          <ErrorBoundary key={location.pathname}>
            <Outlet />
          </ErrorBoundary>
        </div>
      </div>
    </div>
  )
}
