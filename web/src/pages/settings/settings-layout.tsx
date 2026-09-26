import { NavLink, Outlet, useLocation } from 'react-router-dom'
import { cn } from '@/lib/utils'
import { PageHeader } from '@/components/ui/page-header'
import { ErrorBoundary } from '@/components/error-boundary'
import { SETTINGS_GROUPS, SETTINGS_SECTIONS } from './settings-nav'

/**
 * Layout for the /settings/* sub-routes: PageHeader with breadcrumbs, the
 * section NavLink rail (horizontal snap-scroll on mobile, sticky vertical rail
 * on xl), and an Outlet for the active section page.
 *
 * Each section gets its own ErrorBoundary (keyed by pathname) so a crash in
 * one section renders inline with the rail still usable — on top of the
 * app-shell route boundary.
 */
export default function SettingsLayout() {
  const location = useLocation()
  const active =
    SETTINGS_SECTIONS.find((section) => location.pathname.startsWith(section.to)) ??
    SETTINGS_SECTIONS[0]

  return (
    <div className="space-y-6 animate-fade-in">
      <PageHeader
        eyebrow="Settings"
        title={active.label}
        description={active.description}
        breadcrumbs={[{ label: 'Settings', href: '/settings' }, { label: active.label }]}
      />

      <div className="grid gap-6 xl:grid-cols-[200px_minmax(0,1fr)]">
        {/* Settings navigation. This used to be a column of 260px cards, each
            with a 40px icon tile and a description that the page header already
            shows for the active section — a lot of furniture for what is a list
            of links. Now a compact rail using the same active treatment as the
            main sidebar, so navigation looks like navigation everywhere. */}
        <aside className="scrollbar-hide -mx-4 flex gap-1 overflow-x-auto px-4 pb-2 sm:-mx-6 sm:px-6 xl:mx-0 xl:flex-col xl:gap-px xl:self-start xl:px-0 xl:pb-0 xl:sticky xl:top-16">
          {SETTINGS_GROUPS.map((group) => {
            const groupSections = SETTINGS_SECTIONS.filter((s) => group.ids.includes(s.id))
            if (!groupSections.length) return null
            return (
              <div key={group.label} className="contents xl:block xl:not-first:mt-4">
                <p className="hidden px-2 pb-1.5 text-[10px] font-semibold uppercase tracking-[0.12em] text-text-muted xl:block">
                  {group.label}
                </p>
                {groupSections.map((section) => {
                  const Icon = section.icon
                  return (
                    <NavLink
                      key={section.id}
                      to={section.to}
                      className={({ isActive }) =>
                        cn(
                          'relative flex h-8 shrink-0 items-center gap-2.5 rounded-md px-2 text-[13px] transition-colors',
                          isActive
                            ? 'bg-surface-raised font-medium text-text-primary'
                            : 'font-normal text-text-secondary hover:bg-surface-raised hover:text-text-primary',
                        )
                      }
                    >
                      {({ isActive }) => (
                        <>
                          {isActive && (
                            <span
                              aria-hidden="true"
                              className="absolute bottom-1.5 left-0 top-1.5 hidden w-0.5 rounded-full bg-accent xl:block"
                            />
                          )}
                          <Icon className="h-4 w-4 shrink-0" />
                          <span className="truncate">{section.label}</span>
                        </>
                      )}
                    </NavLink>
                  )
                })}
              </div>
            )
          })}
        </aside>

        <div className="min-w-0 space-y-6">
          <ErrorBoundary key={location.pathname}>
            <Outlet />
          </ErrorBoundary>
        </div>
      </div>
    </div>
  )
}
