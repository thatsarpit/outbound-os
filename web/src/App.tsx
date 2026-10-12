import { Suspense, lazy, useEffect } from 'react'
import { BrowserRouter, Routes, Route, Navigate, useLocation } from 'react-router-dom'
import { QueryClientProvider } from '@tanstack/react-query'
import { queryClient } from '@/lib/query-client'
import { useAuthStore } from '@/stores/auth-store'
import { MobileShell } from '@/components/mobile/mobile-shell'
import { AppShell } from '@/components/layout/app-shell'
import { Loader2 } from 'lucide-react'
import { getFirstAccessibleRoute, resolveCapabilityForPath } from '@/lib/role-shell'
import { ChannelWorkspace } from '@/components/integrations/channel-workspace'
import { TooltipProvider } from '@/components/ui'

const MobileInboxPage = lazy(() => import('@/pages/mobile/inbox'))
const MobileLeadsPage = lazy(() => import('@/pages/mobile/leads'))
const MobileTasksPage = lazy(() => import('@/pages/mobile/tasks'))
const MobileInstallPage = lazy(() => import('@/pages/mobile/install'))

/* ── Page imports ── */
const LoginPage = lazy(() => import('@/pages/login'))
const SetupPage = lazy(() => import('@/pages/setup'))
const IntegrationCataloguePage = lazy(() => import('@/pages/integrations/catalogue'))
const OverviewPage = lazy(() => import('@/pages/overview'))
const AutomationPage = lazy(() => import('@/pages/automation'))
const IMessageIntegrationPage = lazy(() => import('@/pages/integrations/imessage'))
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
// Dev-only: design-system showcase and the sample-data shell. The imports sit
// behind `import.meta.env.DEV` as well as the routes, so production and demo
// builds do not even emit their chunks.
const DevUiPage = import.meta.env.DEV ? lazy(() => import('@/pages/dev-ui')) : () => null
const DevShellPage = import.meta.env.DEV ? lazy(() => import('@/pages/dev-shell')) : () => null

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
  { path: 'automation', element: <AutomationPage /> },
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
  { path: 'setup', element: <SetupPage /> },
]

const pageRoutes = () =>
  PAGE_ROUTES.map((r) => <Route key={r.path} path={r.path} element={r.element} />)

const configurationRoutes = () => (
  <>
    <Route path="integrations" element={<IntegrationsLayout />}>
      <Route index element={<Navigate to="all" replace />} />
      <Route path="all" element={<IntegrationCataloguePage />} />
      <Route path="whatsapp" element={<ChannelWorkspace channel="whatsapp" />}>
        <Route index element={<WhatsAppIntegrationPage />} />
        <Route path="configure" element={<WhatsAppSettingsPage />} />
      </Route>
      <Route path="email" element={<ChannelWorkspace channel="email" />}>
        <Route index element={<EmailIntegrationPage />} />
        <Route path="defaults" element={<EmailSettingsPage />} />
      </Route>
      <Route path="imessage" element={<IMessageIntegrationPage />} />
      <Route path="telegram" element={<TelegramIntegrationPage />} />
      <Route path="webhooks" element={<WebhooksIntegrationPage />} />
      <Route path="sheets" element={<SheetsIntegrationPage />} />
    </Route>
    <Route path="channels" element={<Navigate to="/integrations" replace />} />
    <Route path="settings" element={<SettingsLayout />}>
      <Route index element={<Navigate to="workspace" replace />} />
      <Route path="workspace" element={<WorkspaceSettingsPage />} />
      <Route path="commerce" element={<CommerceSettingsPage />} />
      <Route path="whatsapp" element={<Navigate to="/integrations/whatsapp/configure" replace />} />
      <Route path="email" element={<Navigate to="/integrations/email/defaults" replace />} />
      <Route path="imessage" element={<Navigate to="/integrations/imessage" replace />} />
    </Route>
  </>
)

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
                    {configurationRoutes()}
                    {pageRoutes()}
                    <Route path="*" element={<NotFoundPage />} />
                  </Route>
                )}

                <Route
                  path="/m"
                  element={
                    <RequireAuth>
                      <MobileShell />
                    </RequireAuth>
                  }
                >
                  <Route index element={<Navigate to="inbox" replace />} />
                  <Route path="inbox" element={<MobileInboxPage />} />
                  <Route path="tasks" element={<MobileTasksPage />} />
                  <Route path="leads" element={<MobileLeadsPage />} />
                  <Route path="install" element={<MobileInstallPage />} />
                  <Route path="*" element={<NotFoundPage />} />
                </Route>
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
                  {configurationRoutes()}

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
