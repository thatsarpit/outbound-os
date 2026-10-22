import { useEffect } from 'react'
import { Link, NavLink, Outlet, useLocation } from 'react-router-dom'
import {
  CheckSquare,
  Inbox,
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
import { ToastContainer } from '@/components/ui/toast'
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu'
import { useAuthStore } from '@/stores/auth-store'
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
  { to: '/m/account', label: 'More', icon: UserRound, capability: null },
]

export function MobileShell() {
  const location = useLocation()
  const { user, logout, hasCapability } = useAuthStore()
  const { toggleTheme, theme, setIsMobileViewport } = useUIStore()
  const online = useOnlineStatus()
  const conversationOpen =
    location.pathname === '/m/inbox' &&
    !!mobileLeadId(new URLSearchParams(location.search).get('leadId'))
  const page = destinations.find((item) => location.pathname.startsWith(item.to))
  // Inbox has a single editor on either layout. Keep its viewport state fresh
  // even when the phone opens the dedicated sales routes directly.
  useEffect(() => {
    const media = matchMedia('(max-width: 1023px)')
    const sync = () => setIsMobileViewport(media.matches)
    sync()
    media.addEventListener('change', sync)
    return () => media.removeEventListener('change', sync)
  }, [setIsMobileViewport])

  return (
    <div className="mobile-sales min-h-dvh bg-background">
      <div className="mx-auto flex min-h-dvh max-w-2xl flex-col bg-background">
        {!conversationOpen && (
          <header className="sticky top-0 z-30 flex min-h-16 items-center justify-between gap-3 border-b border-border bg-surface px-4 pt-[env(safe-area-inset-top)]">
            <div className="flex min-w-0 items-center gap-3 py-2">
              <BrandMark className="h-9 w-9 shrink-0 text-text-primary" />
              <div className="min-w-0">
                <p className="text-[11px] font-medium text-text-muted">
                  {IS_DEMO ? 'Outbound OS · sample workspace' : 'Outbound OS'}
                </p>
                <h1 className="text-xl font-semibold tracking-tight">
                  {page?.label ??
                    (location.pathname === '/m/account'
                      ? 'Account'
                      : location.pathname === '/m/install'
                        ? 'Install app'
                        : 'Sales workspace')}
                </h1>
              </div>
            </div>
            <div className="flex shrink-0 items-center gap-1">
              <NotificationCenter />
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
                      {user?.role === 'viewer' ? 'Read-only access' : 'Shared sales workspace'}
                    </p>
                  </div>
                  <DropdownMenuSeparator />
                  <DropdownMenuItem asChild>
                    <Link to="/m/account">
                      <UserRound className="h-4 w-4" />
                      Account
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
            !conversationOpen && 'px-4 pt-3 pb-[calc(4.5rem+env(safe-area-inset-bottom))]',
          )}
        >
          <ErrorBoundary key={location.pathname}>
            <Outlet />
          </ErrorBoundary>
        </main>
        {!conversationOpen && (
          <nav
            aria-label="Sales navigation"
            className="fixed inset-x-0 bottom-0 z-30 mx-auto flex max-w-2xl border-t border-border bg-surface/95 px-3 pt-1 pb-[env(safe-area-inset-bottom)]"
          >
            {destinations
              .filter((item) => !item.capability || hasCapability(item.capability))
              .map(({ to, label, icon: Icon }) => (
                <NavLink
                  key={to}
                  to={to}
                  className={({ isActive }) =>
                    cn(
                      'flex min-h-14 flex-1 flex-col items-center justify-center gap-1 rounded-lg text-[11px] font-medium focus-visible:outline-2 focus-visible:outline-focus',
                      isActive ? 'text-accent' : 'text-text-muted',
                    )
                  }
                >
                  <Icon className="h-5 w-5" aria-hidden="true" />
                  {label}
                </NavLink>
              ))}
          </nav>
        )}
      </div>
      <ToastContainer />
    </div>
  )
}
