import type { User } from '@/api/types'

export type AppRole = User['role']

export const ROUTE_CAPABILITIES = [
  { route: '/overview', capability: 'page.overview' },
  { route: '/inbox', capability: 'page.inbox' },
  { route: '/leads', capability: 'page.leads' },
  { route: '/analytics', capability: 'page.analytics' },
  { route: '/pipeline', capability: 'page.pipeline' },
  { route: '/orders', capability: 'page.orders' },
  { route: '/products', capability: 'page.products' },
  { route: '/customers', capability: 'page.customers' },
  { route: '/revenue', capability: 'page.revenue' },
  { route: '/team', capability: 'page.team' },
  { route: '/activity', capability: 'page.activity' },
  { route: '/account', capability: 'page.account' },
  { route: '/campaigns', capability: 'page.campaigns' },
  { route: '/templates', capability: 'page.templates' },
  { route: '/import', capability: 'page.import' },
  { route: '/channels', capability: 'page.integrations' },
  { route: '/integrations', capability: 'page.integrations' },
  { route: '/settings', capability: 'page.settings' },
] as const

export const ROLE_PAGE_CAPABILITIES: Record<AppRole, string[]> = {
  viewer: [
    'page.overview',
    'page.inbox',
    'page.leads',
    'page.analytics',
    'page.pipeline',
    'page.account',
  ],
  agent: [
    'page.orders',
    'page.products',
    'page.customers',
    'page.inbox',
    'page.leads',
    'page.analytics',
    'page.pipeline',
    'page.templates',
    'page.account',
  ],
  manager: [
    'page.orders',
    'page.products',
    'page.customers',
    'page.revenue',
    'page.overview',
    'page.inbox',
    'page.leads',
    'page.analytics',
    'page.pipeline',
    'page.campaigns',
    'page.templates',
    'page.import',
    'page.integrations',
    'page.account',
  ],
  admin: [
    'page.orders',
    'page.products',
    'page.customers',
    'page.revenue',
    'page.overview',
    'page.inbox',
    'page.leads',
    'page.analytics',
    'page.pipeline',
    'page.team',
    'page.campaigns',
    'page.templates',
    'page.import',
    'page.integrations',
    'page.settings',
    'page.account',
  ],
}

export const ROLE_EXPERIENCE: Record<
  AppRole,
  {
    label: string
    subtitle: string
    homeRoute: string
    navOrder: string[]
    overviewTitle: string
    overviewDescription: string
    focusAreas: string[]
  }
> = {
  viewer: {
    label: 'Viewer',
    subtitle: 'Read-only pipeline visibility',
    homeRoute: '/overview',
    navOrder: ['/overview', '/inbox', '/leads', '/analytics', '/pipeline'],
    overviewTitle: 'Pipeline visibility and conversation health',
    overviewDescription:
      'This view keeps read-only users oriented around current volume, reply activity, and where the pipeline is moving.',
    focusAreas: ['Track lead flow', 'Watch reply momentum', 'Review conversion patterns'],
  },
  agent: {
    label: 'Sales Agent',
    subtitle: 'Daily queue, multichannel replies, and follow-up execution',
    homeRoute: '/inbox',
    navOrder: ['/inbox', '/leads', '/orders', '/products', '/templates', '/pipeline', '/analytics'],
    overviewTitle: 'Daily queue and multichannel reply momentum',
    overviewDescription:
      'This view should help sales agents decide who needs a response now, where follow-ups are stuck across channels, and how conversation load is moving.',
    focusAreas: ['Respond from inbox', 'Advance warm leads', 'Use proven templates'],
  },
  manager: {
    label: 'Manager',
    subtitle: 'Team throughput and funnel quality',
    homeRoute: '/overview',
    navOrder: [
      '/overview',
      '/leads',
      '/inbox',
      '/pipeline',
      '/orders',
      '/products',
      '/customers',
      '/analytics',
      '/campaigns',
      '/templates',
      '/import',
      '/channels',
    ],
    overviewTitle: 'Pipeline health and team operating rhythm',
    overviewDescription:
      'This view should tell managers whether intake, multichannel reply quality, and funnel progression are healthy enough for the team to scale volume.',
    focusAreas: ['Coach team throughput', 'Protect reply quality', 'Spot funnel bottlenecks'],
  },
  admin: {
    label: 'Admin',
    subtitle: 'System controls, channels, and workspace performance',
    homeRoute: '/overview',
    navOrder: [
      '/overview',
      '/leads',
      '/inbox',
      '/pipeline',
      '/orders',
      '/products',
      '/customers',
      '/analytics',
      '/team',
      '/campaigns',
      '/templates',
      '/import',
      '/channels',
      '/settings',
    ],
    overviewTitle: 'Pipeline health and engine readiness',
    overviewDescription:
      'This view should answer three questions fast: are new leads arriving, are the outbound channels healthy, and where is the pipeline currently getting stuck.',
    focusAreas: ['Keep engine healthy', 'Tune channels and limits', 'Own workspace configuration'],
  },
}

export function normalizeAppRole(role: unknown): AppRole {
  const normalized = String(role || '')
    .trim()
    .toLowerCase()
  if (normalized === 'sales_agent') return 'agent'
  if (
    normalized === 'viewer' ||
    normalized === 'agent' ||
    normalized === 'manager' ||
    normalized === 'admin'
  ) {
    return normalized
  }
  return 'viewer'
}

export function getHomeRouteForRole(role: AppRole | undefined): string {
  return ROLE_EXPERIENCE[role || 'viewer'].homeRoute
}

export function resolveCapabilityForPath(pathname: string): string | null {
  const match = ROUTE_CAPABILITIES.find((item) => pathname.startsWith(item.route))
  return match?.capability ?? null
}

export function getFirstAccessibleRoute(
  role: AppRole | undefined,
  hasCapability: (capability: string) => boolean,
): string {
  const effectiveRole = role || 'viewer'
  const { navOrder, homeRoute } = ROLE_EXPERIENCE[effectiveRole]
  for (const route of navOrder) {
    const capability = resolveCapabilityForPath(route)
    if (!capability || hasCapability(capability)) return route
  }
  return homeRoute
}
