import { WorkspaceSwitcher } from '@/components/auth/workspace-boundary'
import { Suspense, useEffect, useLayoutEffect } from 'react'
import { Link, Outlet, useLocation } from 'react-router-dom'
import {
  CheckSquare,
  Inbox,
  Info,
  LogOut,
  Monitor,
  Moon,
  Smartphone,
  Sun,
  Users,
  UserRound,
  WifiOff,
} from 'lucide-react'
import { mobileLeadId } from './mobile-shared'
import { ErrorBoundary } from '@/components/error-boundary'
import { LoadingState } from '@/components/ui/loading-state'
import { ToastContainer } from '@/components/ui/toast'
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu'
import { useAuthStore, usePrivateSalesAgent } from '@/stores/auth-store'
import { useUIStore } from '@/stores/ui-store'
import { useOnlineStatus } from '@/hooks/use-online-status'
import { getFirstAccessibleRoute } from '@/lib/role-shell'
import { cn } from '@/lib/utils'
import { IS_DEMO } from '@/demo/demo-chrome'
import { NotificationCenter } from '@/components/layout/notification-center'
import { BrandMark } from '@/components/layout/brand-mark'

const destinations = [
  { to: '/m/inbox', label: 'Inbox', icon: Inbox, capability: 'page.inbox' },
  { to: '/m/tasks', label: 'Tasks', icon: CheckSquare, capability: 'page.leads' },
  { to: '/m/leads', label: 'Leads', icon: Users, capability: 'page.leads' },
  { to: '/m/account', label: 'Account', icon: UserRound, capability: null },
]

export function MobileShell() {
  const privateSales = usePrivateSalesAgent()
  const location = useLocation()
  const { user, logout, hasCapability } = useAuthStore()
  const { toggleTheme, theme, setIsMobileViewport } = useUIStore()
  const online = useOnlineStatus()
  const conversationOpen =
    location.pathname === '/m/inbox' &&
    !!mobileLeadId(new URLSearchParams(location.search).get('leadId'))
  const page = destinations.find((item) => location.pathname === item.to)
  const reviewingDelivery = location.pathname === '/m/delivery'
  const title = reviewingDelivery ? 'Delivery review' : page?.label ??
    (location.pathname === '/m/install' ? 'Install app' : 'Sales workspace')
  // Inbox has a single editor on either layout. Keep its viewport state fresh
  // even when the phone opens the dedicated sales routes directly.
  useEffect(() => {
    const media = matchMedia('(max-width: 1023px)')
    const sync = () => setIsMobileViewport(media.matches)
    sync()
    media.addEventListener('change', sync)
    return () => media.removeEventListener('change', sync)
  }, [setIsMobileViewport])

  useLayoutEffect(() => {
    window.scrollTo({ top: 0, behavior: 'instant' })
  }, [location.pathname])

  return (
    <div className="mobile-sales min-h-dvh bg-background">
      <div className="mx-auto flex min-h-dvh max-w-2xl flex-col bg-background">
        {!conversationOpen && (
          <header className="mobile-sales__header sticky top-0 z-30 flex min-h-[calc(3.5rem+env(safe-area-inset-top))] items-center justify-between gap-3 border-b border-border-subtle bg-background pt-[env(safe-area-inset-top)]">
            <div className="flex min-w-0 items-center gap-2.5 py-2">
              <BrandMark className="size-7 shrink-0 text-accent" />
              <div className="min-w-0">
                <h1 className="truncate text-xl font-semibold tracking-tight">
                  {title}
                </h1>
                {IS_DEMO && (
                  <p className="text-[11px] font-medium text-text-muted">Sample workspace</p>
                )}
                <WorkspaceSwitcher className="block h-auto max-w-36 px-0 text-text-secondary [&:is(button)]:flex [&:is(button)]:min-h-11 [&:is(button)]:justify-start" />
              </div>
            </div>
            <div className="flex shrink-0 items-center gap-1">
              {!privateSales && <NotificationCenter mobile />}
              <DropdownMenu>
                <DropdownMenuTrigger asChild>
                  <button
                    type="button"
                    aria-label="Sales workspace menu"
                    className="flex h-11 w-11 items-center justify-center rounded-full border border-border bg-surface-raised text-text-secondary"
                  >
                    <span className="text-sm font-semibold">
                      {(user?.name || 'Sales')
                        .trim()
                        .split(/\s+/)
                        .slice(0, 2)
                        .map((part) => part[0])
                        .join('')
                        .toUpperCase()}
                    </span>
                  </button>
                </DropdownMenuTrigger>
                <DropdownMenuContent
                  align="end"
                  className="mobile-sales w-64 [&_[role=menuitem]]:min-h-11"
                >
                  <div className="px-3 py-2">
                    <p className="truncate text-sm font-semibold">{user?.name}</p>
                    <p className="text-xs text-text-muted">
                      {user?.role === 'viewer'
                        ? 'Read-only access'
                        : privateSales
                          ? 'Assigned leads and new inbounds'
                          : 'Shared sales workspace'}
                    </p>
                  </div>
                  <DropdownMenuSeparator />
                  <DropdownMenuItem asChild>
                    <Link to="/m/account">
                      <UserRound className="h-4 w-4" />
                      Account
                    </Link>
                  </DropdownMenuItem>
                  <DropdownMenuItem asChild>
                    <Link to="/m/account#about">
                      <Info className="h-4 w-4" />
                      About Outbound OS
                    </Link>
                  </DropdownMenuItem>
                  <DropdownMenuItem onSelect={toggleTheme}>
                    {theme === 'light' ? <Moon className="h-4 w-4" /> : <Sun className="h-4 w-4" />}
                    Change appearance
                  </DropdownMenuItem>
                  <DropdownMenuItem asChild>
                    <Link to="/m/install">
                      <Smartphone className="h-4 w-4" />
                      Add to Home Screen
                    </Link>
                  </DropdownMenuItem>
                  <DropdownMenuItem asChild>
                    <Link to={`${getFirstAccessibleRoute(user?.role, hasCapability)}?view=desktop`}>
                      <Monitor className="h-4 w-4" />
                      Open full dashboard
                    </Link>
                  </DropdownMenuItem>
                  <DropdownMenuSeparator />
                  <DropdownMenuItem destructive onSelect={() => logout()}>
                    <LogOut className="h-4 w-4" />
                    Sign out
                  </DropdownMenuItem>
                </DropdownMenuContent>
              </DropdownMenu>
            </div>
          </header>
        )}
        {!online && !conversationOpen && (
          <p
            role="status"
            className="flex items-center gap-2 bg-warning-muted px-4 py-3 text-sm text-warning"
          >
            <WifiOff className="h-4 w-4 shrink-0" />
            Offline. Reconnect to refresh or send.
          </p>
        )}
        <main
          className={cn(
            'min-w-0 flex-1',
            !conversationOpen && 'mobile-sales__content pt-2.5',
          )}
        >
          <ErrorBoundary key={location.pathname}>
            <Suspense fallback={<LoadingState variant="inline" label="Opening page…" className="p-4" />}>
              <Outlet />
            </Suspense>
          </ErrorBoundary>
        </main>
        {!conversationOpen && (
          <nav
            aria-label="Sales navigation"
            className="mobile-sales__tabs"
          >
            {destinations
              .filter((item) => !item.capability || hasCapability(item.capability))
              .map(({ to, label, icon: Icon }) => (
                <Link
                  key={to}
                  to={to}
                  aria-current={page?.to === to || (reviewingDelivery && to === '/m/inbox') ? 'page' : undefined}
                  className="mobile-sales__tab focus-visible:outline-2 focus-visible:outline-focus"
                >
                  <Icon className="size-5" aria-hidden="true" />
                  <span>{label}</span>
                </Link>
              ))}
          </nav>
        )}
      </div>
      <ToastContainer />
    </div>
  )
}
