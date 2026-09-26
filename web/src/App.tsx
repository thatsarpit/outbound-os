import { Suspense, lazy, useEffect } from 'react'
import { BrowserRouter, Routes, Route, Navigate, useLocation } from 'react-router-dom'
import { MutationCache, QueryCache, QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { useAuthStore } from '@/stores/auth-store'
import { toast } from '@/stores/toast-store'
import { AppShell } from '@/components/layout/app-shell'
import { Loader2 } from 'lucide-react'
import { getFirstAccessibleRoute, resolveCapabilityForPath } from '@/lib/role-shell'
import { TooltipProvider } from '@/components/ui'

/* ── Page imports ── */
const LoginPage = lazy(() => import('@/pages/login'))
const OverviewPage = lazy(() => import('@/pages/overview'))
const InboxPage = lazy(() => import('@/pages/inbox'))
const LeadsPage = lazy(() => import('@/pages/leads'))
const CommerceSettingsPage = lazy(() => import('@/pages/settings/commerce'))
const OrdersPage = lazy(() => import('@/pages/orders'))
const ProductsPage = lazy(() => import('@/pages/products'))
const CustomersPage = lazy(() => import('@/pages/customers'))
const RevenuePage = lazy(() => import('@/pages/revenue'))
const AnalyticsPage = lazy(() => import('@/pages/analytics'))
const PipelinePage = lazy(() => import('@/pages/pipeline'))
const TeamPage = lazy(() => import('@/pages/team'))
const ActivityPage = lazy(() => import('@/pages/activity'))
const NotFoundPage = lazy(() => import('@/pages/not-found'))
const AccountPage = lazy(() => import('@/pages/account'))
const CampaignsPage = lazy(() => import('@/pages/campaigns'))
const TemplatesPage = lazy(() => import('@/pages/templates'))
const ImportPage = lazy(() => import('@/pages/import'))
const IntegrationsLayout = lazy(() => import('@/pages/integrations/integrations-layout'))
const WhatsAppIntegrationPage = lazy(() => import('@/pages/integrations/whatsapp'))
const EmailIntegrationPage = lazy(() => import('@/pages/integrations/email'))
const TelegramIntegrationPage = lazy(() => import('@/pages/integrations/telegram'))
const WebhooksIntegrationPage = lazy(() => import('@/pages/integrations/webhooks'))
const SheetsIntegrationPage = lazy(() => import('@/pages/integrations/sheets'))
const SettingsLayout = lazy(() => import('@/pages/settings/settings-layout'))
const WorkspaceSettingsPage = lazy(() => import('@/pages/settings/workspace'))
const WhatsAppSettingsPage = lazy(() => import('@/pages/settings/whatsapp'))
const EmailSettingsPage = lazy(() => import('@/pages/settings/email'))
const IMessageSettingsPage = lazy(() => import('@/pages/settings/imessage'))
// Dev-only: design-system showcase. Tree-shaken in production builds because
// the route below is gated on `import.meta.env.DEV`.
const DevUiPage = lazy(() => import('@/pages/dev-ui'))
const DevShellPage = lazy(() => import('@/pages/dev-shell'))

/* ── Query Client ──
 * Global mutation + query error handlers fire a toast whenever an API call
 * fails. Pages may opt out by passing `meta: { silent: true }` on the
 * mutation/query, or by providing their own `onError` (which doesn't suppress
 * the global one — they compose). Auth failures (401) are swallowed because
 * the api client already redirects to /login. */
const queryClient = new QueryClient({
  defaultOptions: {
    queries: {
      retry: 1,
      refetchOnWindowFocus: false,
      staleTime: 30_000,
    },
  },
  mutationCache: new MutationCache({
    onError: (error, _variables, _context, mutation) => {
      if (mutation.meta?.silent) return
      const msg = (error as Error)?.message || 'Something went wrong'
      // Swallow 401s — auth client already redirects
      if (/unauthorized|401/i.test(msg)) return
      toast.error(msg)
    },
    onSuccess: (_data, _variables, _context, mutation) => {
      // Only toast on success if the mutation declared a `successMessage` in meta.
      // Default behaviour stays silent so pages don't get a "Saved!" on every form blur.
      const m = mutation.meta?.successMessage
      if (typeof m === 'string' && m.length > 0) toast.success(m)
    },
  }),
  queryCache: new QueryCache({
    onError: (error, query) => {
      if (query.meta?.silent) return
      // Don't toast for background refetches — the user didn't ask for them.
      // Only toast when the query just transitioned to error state on the first load.
      if (query.state.data !== undefined) return
      const msg = (error as Error)?.message || 'Failed to load'
      if (/unauthorized|401/i.test(msg)) return
      toast.error(msg)
    },
  }),
})

/* ── Loading spinner ── */
function FullPageLoader() {
  return (
    <div className="min-h-screen bg-background flex items-center justify-center">
      <Loader2 className="w-8 h-8 text-accent animate-spin" />
    </div>
  )
}

/* ── Auth guard ── */
function RequireAuth({ children }: { children: React.ReactNode }) {
  const { isAuthenticated, isLoading, hasCapability, user } = useAuthStore()
  const location = useLocation()

  if (isLoading) return <FullPageLoader />
  if (!isAuthenticated) {
    return <Navigate to="/login" state={{ from: location }} replace />
  }
  const requiredCapability = resolveCapabilityForPath(location.pathname)
  if (requiredCapability && !hasCapability(requiredCapability)) {
    return <Navigate to={getFirstAccessibleRoute(user?.role, hasCapability)} replace />
  }
  return <>{children}</>
}

function RoleHomeRoute() {
  const { hasCapability, user } = useAuthStore()
  return <Navigate to={getFirstAccessibleRoute(user?.role, hasCapability)} replace />
}

/* ── Auth initializer ── */
function AuthInit({ children }: { children: React.ReactNode }) {
  const { checkAuth } = useAuthStore()

  useEffect(() => {
    checkAuth()
  }, [checkAuth])

  return <>{children}</>
}

/* ── App Root ── */

/**
 * Page routes rendered by BOTH the real app and the dev shell.
 *
 * These used to be written out twice. They drifted: Orders, Customers and
 * Revenue were added to the dev-shell copy only, so those pages worked in the
 * preview and 404'd in production — and because the preview was where they
 * were tested, the gap did not show up. One list, rendered in both places, is
 * what stops that happening again.
 */
const PAGE_ROUTES: Array<{ path: string; element: React.ReactNode }> = [
  { path: 'overview', element: <OverviewPage /> },
  { path: 'inbox', element: <InboxPage /> },
  { path: 'leads', element: <LeadsPage /> },
  { path: 'orders', element: <OrdersPage /> },
  { path: 'products', element: <ProductsPage /> },
  { path: 'customers', element: <CustomersPage /> },
  { path: 'revenue', element: <RevenuePage /> },
  { path: 'pipeline', element: <PipelinePage /> },
  { path: 'analytics', element: <AnalyticsPage /> },
  { path: 'campaigns', element: <CampaignsPage /> },
  { path: 'templates', element: <TemplatesPage /> },
  { path: 'import', element: <ImportPage /> },
  { path: 'team', element: <TeamPage /> },
  { path: 'activity', element: <ActivityPage /> },
  { path: 'account', element: <AccountPage /> },
]

const pageRoutes = () =>
  PAGE_ROUTES.map((r) => <Route key={r.path} path={r.path} element={r.element} />)

export default function App() {
  return (
    <QueryClientProvider client={queryClient}>
      <TooltipProvider delayDuration={150}>
        <BrowserRouter>
          <AuthInit>
            <Suspense fallback={<FullPageLoader />}>
              <Routes>
                {/* Public */}
                <Route path="/login" element={<LoginPage />} />
                {/* Invitation acceptance is now Clerk's own hosted flow — the
                    invitation email links to Clerk's domain, not this app. */}

                {/* Dev-only: design-system showcase */}
                {import.meta.env.DEV && <Route path="/dev/ui" element={<DevUiPage />} />}

                {/* Dev-only: the real app shell, seeded with fixture data so the
                    chrome can be reviewed without a backend or a login. */}
                {import.meta.env.DEV && (
                  <Route path="/dev/shell" element={<DevShellPage />}>
                    <Route index element={<OverviewPage />} />
                    <Route path="ui" element={<DevUiPage />} />
                    <Route path="inbox" element={<InboxPage />} />
                    <Route path="activity" element={<ActivityPage />} />
                    <Route path="account" element={<AccountPage />} />
                    <Route path="settings" element={<SettingsLayout />}>
                      <Route index element={<WorkspaceSettingsPage />} />
                      <Route path="workspace" element={<WorkspaceSettingsPage />} />
                      <Route path="whatsapp" element={<WhatsAppSettingsPage />} />
                      <Route path="commerce" element={<CommerceSettingsPage />} />
                    </Route>
                    <Route path="integrations" element={<IntegrationsLayout />}>
                      <Route index element={<WhatsAppIntegrationPage />} />
                      <Route path="whatsapp" element={<WhatsAppIntegrationPage />} />
                      <Route path="email" element={<EmailIntegrationPage />} />
                      <Route path="telegram" element={<TelegramIntegrationPage />} />
                    </Route>
                    {pageRoutes()}
                    <Route path="*" element={<NotFoundPage />} />
                  </Route>
                )}

                {/* Protected */}
                <Route
                  element={
                    <RequireAuth>
                      <AppShell />
                    </RequireAuth>
                  }
                >
                  <Route index element={<RoleHomeRoute />} />
                  {pageRoutes()}
                  <Route path="integrations" element={<IntegrationsLayout />}>
                    <Route index element={<Navigate to="/integrations/whatsapp" replace />} />
                    <Route path="whatsapp" element={<WhatsAppIntegrationPage />} />
                    <Route path="email" element={<EmailIntegrationPage />} />
                    <Route path="telegram" element={<TelegramIntegrationPage />} />
                    <Route path="webhooks" element={<WebhooksIntegrationPage />} />
                    <Route path="sheets" element={<SheetsIntegrationPage />} />
                  </Route>
                  <Route path="channels" element={<Navigate to="/integrations" replace />} />
                  <Route path="settings" element={<SettingsLayout />}>
                    <Route index element={<Navigate to="/settings/workspace" replace />} />
                    <Route path="workspace" element={<WorkspaceSettingsPage />} />
                    <Route path="whatsapp" element={<WhatsAppSettingsPage />} />
                    <Route path="email" element={<EmailSettingsPage />} />
                    <Route path="imessage" element={<IMessageSettingsPage />} />
                    <Route path="commerce" element={<CommerceSettingsPage />} />
                  </Route>

                  {/* Anything else under the shell is a real not-found page, not a
                      silent redirect that hides the broken link. */}
                  <Route path="*" element={<NotFoundPage />} />
                </Route>
              </Routes>
            </Suspense>
          </AuthInit>
        </BrowserRouter>
      </TooltipProvider>
    </QueryClientProvider>
  )
}
