import { Link, NavLink, Outlet, useLocation } from 'react-router-dom'
import { cn } from '@/lib/utils'
import { PageHeader } from '@/components/ui/page-header'
import { Button } from '@/components/ui/button'
import { ErrorBoundary } from '@/components/error-boundary'
import { SETTINGS_SECTIONS } from './settings-nav'

export default function SettingsLayout() {
  const location = useLocation()
  const canonicalPath = location.pathname.replace(/^\/dev\/shell/, '')
  const active =
    SETTINGS_SECTIONS.find((section) => canonicalPath.startsWith(section.to)) ??
    SETTINGS_SECTIONS[0]

  return (
    <div className="animate-fade-in space-y-5">
      <PageHeader
        title={active.label === 'Workspace' ? 'Workspace settings' : active.label}
        description={active.description}
        breadcrumbs={[{ label: 'Settings', href: '/settings' }, { label: active.label }]}
        actions={
          <>
            <Button asChild size="sm" variant="secondary">
              <Link to="/integrations">Integrations</Link>
            </Button>
            <Button asChild size="sm" variant="secondary">
              <Link to="/automation">Automation</Link>
            </Button>
          </>
        }
      />
      <nav
        aria-label="Settings categories"
        className="flex gap-5 overflow-x-auto border-b border-border"
      >
        {SETTINGS_SECTIONS.map((section) => {
          const Icon = section.icon
          return (
            <NavLink
              key={section.id}
              to={section.to}
              className={({ isActive }) =>
                cn(
                  'flex shrink-0 items-center gap-2 border-b-2 px-1 pb-3 text-[13px] transition-colors focus-visible:outline-2 focus-visible:outline-focus',
                  isActive
                    ? 'border-accent font-medium text-text-primary'
                    : 'border-transparent text-text-secondary hover:text-text-primary',
                )
              }
            >
              <Icon className="h-4 w-4" aria-hidden="true" />
              {section.label}
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
  )
}
