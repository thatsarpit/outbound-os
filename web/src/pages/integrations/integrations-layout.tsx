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
        title={`${active.label} connections`}
        description={active.description}
        breadcrumbs={[{ label: 'Integrations', href: '/integrations' }, { label: active.label }]}
      />

      {/* Sibling views, so an underlined tab row rather than solid ink pills —
          a filled pill reads as a primary action, not as "you are here". */}
      <div className="scrollbar-hide -mb-px flex gap-4 overflow-x-auto border-b border-border">
        {tabs.map((tab) => {
          const Icon = tab.icon
          return (
            <NavLink
              key={tab.id}
              to={tab.to}
              className={({ isActive }) =>
                cn(
                  'flex shrink-0 items-center gap-1.5 border-b-2 pb-2 text-[13px] transition-colors',
                  isActive
                    ? 'border-accent font-medium text-text-primary'
                    : 'border-transparent font-normal text-text-secondary hover:text-text-primary',
                )
              }
            >
              <Icon className="h-3.5 w-3.5" />
              {tab.label}
            </NavLink>
          )
        })}
      </div>

      <ErrorBoundary key={location.pathname}>
        <Outlet />
      </ErrorBoundary>
    </div>
  )
}
