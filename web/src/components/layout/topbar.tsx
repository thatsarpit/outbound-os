import { Link, useLocation } from 'react-router-dom'
import { useAuthStore } from '@/stores/auth-store'
import { useUIStore } from '@/stores/ui-store'
import { ROLE_EXPERIENCE } from '@/lib/role-shell'
import { cn } from '@/lib/utils'
import { Menu, LogOut, MessageCircleMore, ChevronDown, Search, UserCog } from 'lucide-react'
import { NotificationCenter } from './notification-center'
import { ThemeToggle } from './theme-toggle'
import { SUPPORT_URL } from '@/lib/branding'
import {
  DropdownMenu,
  DropdownMenuTrigger,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
} from '@/components/ui/dropdown-menu'

const PAGE_TITLES: Array<{ route: string; title: string }> = [
  { route: '/overview', title: 'Overview' },
  { route: '/inbox', title: 'Inbox' },
  { route: '/leads', title: 'Leads' },
  { route: '/analytics', title: 'Analytics' },
  { route: '/pipeline', title: 'Pipeline' },
  { route: '/team', title: 'Team' },
  { route: '/activity', title: 'Activity' },
  { route: '/account', title: 'Account' },
  { route: '/campaigns', title: 'Campaigns' },
  { route: '/templates', title: 'Templates' },
  { route: '/import', title: 'Import' },
  { route: '/channels', title: 'Channels' },
  { route: '/integrations', title: 'Channels' },
  { route: '/settings', title: 'Settings' },
]

function UserMenu() {
  const { user, logout } = useAuthStore()
  const experience = ROLE_EXPERIENCE[user?.role || 'viewer']
  const name = user?.name || 'User'
  const initials = name
    .split(' ')
    .filter(Boolean)
    .slice(0, 2)
    .map((part) => part[0]?.toUpperCase())
    .join('')

  return (
    <DropdownMenu>
      <DropdownMenuTrigger asChild>
        <button
          type="button"
          aria-label="Account menu"
          className="flex h-8 items-center gap-2 rounded-md pl-1 pr-1.5 text-left transition-colors hover:bg-surface-raised"
        >
          <span className="flex h-6 w-6 shrink-0 items-center justify-center rounded-full bg-accent text-[10px] font-semibold text-accent-fg">
            {initials || 'U'}
          </span>
          <span className="hidden max-w-32 truncate text-xs font-medium text-text-primary lg:block">
            {name}
          </span>
          <ChevronDown className="hidden h-3.5 w-3.5 text-text-muted lg:block" />
        </button>
      </DropdownMenuTrigger>
      <DropdownMenuContent align="end" className="w-60">
        <DropdownMenuLabel>
          <span className="block truncate text-text-primary">{name}</span>
          <span className="mt-0.5 block text-[11px] font-normal text-text-muted">
            {experience.label} &middot; {user?.email || 'Signed in'}
          </span>
        </DropdownMenuLabel>
        <DropdownMenuSeparator />
        <DropdownMenuItem asChild>
          <Link to="/account">
            <UserCog className="h-3.5 w-3.5" />
            Account settings
          </Link>
        </DropdownMenuItem>
        <DropdownMenuItem asChild>
          <a href={SUPPORT_URL} target="_blank" rel="noreferrer">
            <MessageCircleMore className="h-3.5 w-3.5" />
            Help &amp; community
          </a>
        </DropdownMenuItem>
        <DropdownMenuSeparator />
        <DropdownMenuItem destructive onSelect={() => logout()}>
          <LogOut className="h-3.5 w-3.5" />
          Sign out
        </DropdownMenuItem>
      </DropdownMenuContent>
    </DropdownMenu>
  )
}

export function Topbar({ onOpenSearch }: { onOpenSearch: () => void }) {
  const location = useLocation()
  const { toggleSidebar } = useUIStore()
  const page = PAGE_TITLES.find((item) => location.pathname.startsWith(item.route))

  return (
    <header className="sticky top-0 z-30 flex h-12 shrink-0 items-center gap-2 border-b border-border bg-surface px-3 sm:px-4">
      <button
        type="button"
        onClick={toggleSidebar}
        aria-label="Open navigation"
        className="-ml-1 rounded-md p-1.5 text-text-secondary transition-colors hover:bg-surface-raised hover:text-text-primary lg:hidden"
      >
        <Menu className="h-4 w-4" aria-hidden="true" />
      </button>

      <h1 className="shrink-0 text-sm font-semibold tracking-tight">
        {page?.title || 'Dashboard'}
      </h1>

      <span aria-hidden="true" className="hidden h-4 w-px bg-border sm:block" />

      <div className="hidden sm:block"></div>

      <div className="ml-auto flex items-center gap-1">
        <button
          type="button"
          onClick={onOpenSearch}
          className={cn(
            'flex h-7 items-center gap-2 rounded-md border border-border bg-surface px-2 text-xs text-text-muted transition-colors',
            'hover:bg-surface-raised hover:text-text-secondary',
          )}
          aria-label="Search leads, campaigns and pages"
        >
          <Search className="h-3.5 w-3.5" />
          <span className="hidden xl:inline">Search</span>
          <kbd className="hidden rounded border border-border bg-surface-raised px-1 font-mono text-[10px] text-text-muted xl:inline">
            &#8984;K
          </kbd>
        </button>

        <NotificationCenter />
        <ThemeToggle className="h-8 w-8 border-0 bg-transparent" />
        <UserMenu />
      </div>
    </header>
  )
}
