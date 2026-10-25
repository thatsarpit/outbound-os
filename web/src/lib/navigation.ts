import type { LucideIcon } from 'lucide-react'
import {
  LayoutDashboard,
  MessageSquare,
  Users,
  Kanban,
  Megaphone,
  FileText,
  CalendarClock,
  ListTodo,
  Package,
  Package2,
  Contact,
  BarChart3,
  TrendingUp,
  Plug,
  UserCog,
  History,
  Settings,
  Upload,
} from 'lucide-react'

export type NavigationItem = { to: string; label: string; icon: LucideIcon; capability: string }
export const NAVIGATION_GROUPS: Array<{ label: string; items: NavigationItem[] }> = [
  {
    label: 'Workspace',
    items: [
      { to: '/overview', label: 'Overview', icon: LayoutDashboard, capability: 'page.overview' },
      { to: '/inbox', label: 'Inbox', icon: MessageSquare, capability: 'page.inbox' },
      { to: '/tasks', label: 'Tasks', icon: ListTodo, capability: 'page.leads' },
      { to: '/leads', label: 'Leads', icon: Users, capability: 'page.leads' },
      { to: '/pipeline', label: 'Pipeline', icon: Kanban, capability: 'page.pipeline' },
    ],
  },
  {
    label: 'Outreach',
    items: [
      { to: '/campaigns', label: 'Campaigns', icon: Megaphone, capability: 'page.campaigns' },
      { to: '/templates', label: 'Templates', icon: FileText, capability: 'page.templates' },
      { to: '/automation', label: 'Automation', icon: CalendarClock, capability: 'page.settings' },
      { to: '/import', label: 'Import leads', icon: Upload, capability: 'page.import' },
    ],
  },
  {
    label: 'Sales',
    items: [
      { to: '/orders', label: 'Orders', icon: Package, capability: 'page.orders' },
      { to: '/customers', label: 'Customers', icon: Contact, capability: 'page.customers' },
      { to: '/products', label: 'Products', icon: Package2, capability: 'page.products' },
    ],
  },
  {
    label: 'Reports',
    items: [
      { to: '/analytics', label: 'Analytics', icon: BarChart3, capability: 'page.analytics' },
      { to: '/revenue', label: 'Revenue', icon: TrendingUp, capability: 'page.revenue' },
    ],
  },
  {
    label: 'Administration',
    items: [
      { to: '/integrations', label: 'Integrations', icon: Plug, capability: 'page.integrations' },
      { to: '/team', label: 'Team', icon: UserCog, capability: 'page.team' },
      { to: '/activity', label: 'Activity', icon: History, capability: 'page.activity' },
      { to: '/settings', label: 'Settings', icon: Settings, capability: 'page.settings' },
    ],
  },
]
export const NAVIGATION_ITEMS = NAVIGATION_GROUPS.flatMap((group) => group.items)
