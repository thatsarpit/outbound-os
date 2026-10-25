import { useState } from 'react'
import { useQuery, useQueryClient } from '@tanstack/react-query'
import {
  Bot,
  CheckCircle2,
  Copy,
  ExternalLink,
  Loader2,
  RefreshCw,
  ShieldCheck,
  Unplug,
} from 'lucide-react'
import { mcpApi } from '@/api/endpoints/mcp'
import { Button } from '@/components/ui'
import { cn } from '@/lib/utils'
import { mcpReferenceConfiguration, mcpSetupCommand, mcpSetupPrompt } from '@/lib/mcp-setup'
import { toast } from '@/stores/toast-store'
import { useAuthStore } from '@/stores/auth-store'

type Client = 'chatgpt' | 'codex' | 'claude' | 'claude-code' | 'other'
type Provider = 'openai' | 'anthropic' | 'other'
const PROVIDERS: Array<{
  id: Provider
  label: string
  clients: Array<{ id: Client; label: string }>
}> = [
  {
    id: 'openai',
    label: 'OpenAI',
    clients: [
      { id: 'chatgpt', label: 'ChatGPT web' },
      { id: 'codex', label: 'Codex · desktop, CLI & IDE' },
    ],
  },
  {
    id: 'anthropic',
    label: 'Anthropic',
    clients: [
      { id: 'claude', label: 'Claude web & desktop' },
      { id: 'claude-code', label: 'Claude Code' },
    ],
  },
  { id: 'other', label: 'Other agents', clients: [{ id: 'other', label: 'Remote MCP client' }] },
]
const VERIFY_PROMPT =
  'Use Outbound OS to run system_status and whatsapp_accounts. Report the connection status. Do not send messages, start campaigns, import leads or change any data.'

async function copyText(value: string) {
  try {
    await navigator.clipboard.writeText(value)
    toast.success('Copied to clipboard')
  } catch {
    toast.error('Copy was unavailable. Select the text and copy it manually.')
  }
}
function CopyBlock({ label, value }: { label: string; value: string }) {
  return (
    <div className="min-w-0 overflow-hidden rounded-lg border border-border bg-background">
      <div className="flex items-center justify-between gap-3 border-b border-border px-4 py-2">
        <span className="text-xs font-medium text-text-secondary">{label}</span>
        <Button
          variant="ghost"
          size="sm"
          onClick={() => void copyText(value)}
          aria-label={`Copy ${label}`}
        >
          <Copy className="h-3.5 w-3.5" aria-hidden="true" /> Copy
        </Button>
      </div>
      <pre className="overflow-x-auto whitespace-pre-wrap break-words px-4 py-3 font-mono text-xs leading-6 text-text-primary">
        <code>{value}</code>
      </pre>
    </div>
  )
}

export default function McpIntegrationPage() {
  const [provider, setProvider] = useState<Provider>('openai')
  const [client, setClient] = useState<Client>('chatgpt')
  const [tab, setTab] = useState<'connect' | 'apps'>('connect')
  const [revoking, setRevoking] = useState<string | null>(null)
  const isAdmin = useAuthStore((state) => state.user?.role === 'admin')
  const dashboardScope = useAuthStore((state) => state.dashboardScope)
  const queryClient = useQueryClient()
  const connection = useQuery({
    queryKey: ['mcp-connection'],
    queryFn: mcpApi.connection,
    staleTime: 60_000,
    retry: false,
    meta: { silent: true },
  })
  const grants = useQuery({
    queryKey: ['mcp-grants', dashboardScope],
    queryFn: mcpApi.grants,
    enabled: isAdmin && tab === 'apps',
    retry: false,
    meta: { silent: true },
  })
  const data = connection.data
  const url = data?.serverUrl
  const personal = data?.authorizationMode === 'personal'
  const reachable = !connection.isError && data?.health.status === 'reachable'
  const HealthIcon = connection.isPending ? Loader2 : reachable ? CheckCircle2 : Unplug
  const healthLabel = connection.isPending
    ? 'Checking server…'
    : connection.isError
      ? 'Status unavailable'
      : reachable
        ? 'Server reachable'
        : data?.health.status === 'not_configured'
          ? 'Setup needed'
          : 'Server unreachable'
  const clients = PROVIDERS.find((item) => item.id === provider)!.clients
  async function revoke(id: string) {
    setRevoking(id)
    try {
      await mcpApi.revoke(id)
      await queryClient.invalidateQueries({ queryKey: ['mcp-grants'] })
      toast.success('Connection revoked')
    } catch (error) {
      toast.error(error instanceof Error ? error.message : 'The connection could not be revoked.')
    } finally {
      setRevoking(null)
    }
  }
  return (
    <div className="space-y-5">
      <section
        className="rounded-xl border border-border bg-surface p-5 sm:p-6"
        aria-labelledby="mcp-title"
      >
        <div className="flex flex-wrap items-start justify-between gap-4">
          <div className="flex items-start gap-3">
            <div className="flex h-11 w-11 shrink-0 items-center justify-center rounded-lg border border-border bg-background">
              <Bot className="h-5 w-5" aria-hidden="true" />
            </div>
            <div>
              <h1 id="mcp-title" className="text-lg font-semibold text-text-primary">
                AI agents & MCP
              </h1>
              <p className="mt-1 max-w-2xl text-sm leading-6 text-text-secondary">
                Bring your leads, conversations and reports into the AI client you already use.
              </p>
            </div>
          </div>
          <span
            role="status"
            className={cn(
              'inline-flex items-center gap-1.5 rounded-full px-2.5 py-1 text-xs font-medium',
              reachable ? 'bg-success-muted text-success' : 'bg-surface-raised text-text-secondary',
            )}
          >
            <HealthIcon
              className={cn('h-3.5 w-3.5', connection.isPending && 'animate-spin')}
              aria-hidden="true"
            />
            {healthLabel}
          </span>
        </div>
        <div className="mt-5 flex flex-wrap items-center justify-between gap-3 border-t border-border pt-4">
          <p className="max-w-2xl text-xs leading-5 text-text-secondary">
            {personal
              ? 'New connections use your dashboard sign-in and an explicit read-only approval.'
              : 'This server currently uses legacy shared integration authorization.'}{' '}
            Server reachability does not prove that an AI client is authorized.
          </p>
          <Button
            variant="secondary"
            size="sm"
            onClick={() => void connection.refetch()}
            pending={connection.isFetching}
            pendingLabel="Checking…"
          >
            <RefreshCw className="h-3.5 w-3.5" aria-hidden="true" /> Check server
          </Button>
        </div>
        {data?.legacyCompatibility && (
          <p className="mt-3 text-xs leading-5 text-warning">
            Existing shared administrator credentials remain enabled for compatibility. New personal
            read-only permissions do not restrict those legacy credentials.
          </p>
        )}
        {data && !data.backendConfigured && (
          <p className="mt-3 text-xs text-warning">
            Backend credentials are not configured. Ask the server administrator to finish setup.
          </p>
        )}
      </section>
      <div
        role="group"
        aria-label="AI connection views"
        className="inline-flex gap-1 rounded-lg border border-border bg-surface p-1"
      >
        {(
          [
            ['connect', 'Connect an agent'],
            ['apps', 'Connected apps'],
          ] as const
        ).map(([value, label]) => (
          <button
            key={value}
            type="button"
            aria-pressed={tab === value}
            onClick={() => setTab(value)}
            className={cn(
              'rounded-md px-4 py-2 text-sm font-medium',
              tab === value
                ? 'bg-surface-raised text-text-primary'
                : 'text-text-secondary hover:text-text-primary',
            )}
          >
            {label}
          </button>
        ))}
      </div>
      {tab === 'connect' ? (
        <div className="grid items-start gap-5 xl:grid-cols-[minmax(0,1.6fr)_minmax(260px,1fr)]">
          <section className="min-w-0 space-y-5 rounded-xl border border-border bg-surface p-5 sm:p-6">
            <div>
              <h2 className="text-sm font-semibold text-text-primary">1. Choose your AI client</h2>
              <p className="mt-1 text-xs leading-5 text-text-secondary">
                Each client creates its own connection, including clients from the same provider.
              </p>
            </div>
            <div role="group" aria-label="AI provider" className="flex flex-wrap gap-2">
              {PROVIDERS.map((item) => (
                <button
                  key={item.id}
                  type="button"
                  aria-pressed={provider === item.id}
                  onClick={() => {
                    setProvider(item.id)
                    setClient(item.clients[0].id)
                  }}
                  className={cn(
                    'rounded-lg border px-4 py-2 text-sm font-medium',
                    provider === item.id
                      ? 'border-text-primary bg-surface-raised text-text-primary'
                      : 'border-border text-text-secondary hover:border-border-strong',
                  )}
                >
                  {item.label}
                </button>
              ))}
            </div>
            {clients.length > 1 && (
              <div role="group" aria-label="AI client" className="flex flex-wrap gap-2">
                {clients.map((item) => (
                  <button
                    key={item.id}
                    type="button"
                    aria-pressed={client === item.id}
                    onClick={() => setClient(item.id)}
                    className={cn(
                      'rounded-md px-3 py-2 text-xs',
                      client === item.id
                        ? 'bg-surface-raised text-text-primary'
                        : 'text-text-secondary hover:text-text-primary',
                    )}
                  >
                    {item.label}
                  </button>
                ))}
              </div>
            )}
            <div className="border-t border-border pt-5">
              <h2 className="mb-3 text-sm font-semibold text-text-primary">
                2. Set up the connection
              </h2>
              {url ? (
                <CopyBlock
                  label="Setup prompt · paste into your AI client"
                  value={mcpSetupPrompt(client, url)}
                />
              ) : (
                <p className="text-sm text-text-secondary">
                  {connection.isPending
                    ? 'Loading the public server URL…'
                    : 'The public MCP URL is unavailable. Check the server configuration.'}
                </p>
              )}
              <p className="mt-3 text-xs leading-5 text-text-muted">
                A prompt guides setup where the client supports it. You still review authorization
                in your browser. It contains no credentials.
              </p>
            </div>
            <details className="rounded-lg border border-border p-4">
              <summary className="cursor-pointer text-sm font-medium text-text-primary">
                Manual and advanced setup
              </summary>
              <div className="mt-4 space-y-4 text-xs leading-6 text-text-secondary">
                {url && <CopyBlock label="MCP server URL" value={url} />}
                {client === 'chatgpt' && (
                  <p>
                    In ChatGPT web, add a custom MCP server or app in the available Apps/Plugins
                    settings. Name it Outbound OS, paste the URL, choose OAuth and complete
                    authorization. Availability depends on your ChatGPT workspace.{' '}
                    <a
                      href="https://developers.openai.com/api/docs/guides/custom-mcp-server"
                      target="_blank"
                      rel="noreferrer"
                      className="inline-flex items-center gap-1 underline underline-offset-4"
                    >
                      Official setup guide <ExternalLink className="h-3 w-3" aria-hidden="true" />
                    </a>
                  </p>
                )}
                {client === 'codex' && (
                  <>
                    <p>
                      In Codex, open Settings → MCP servers, add a Streamable HTTP server, then
                      choose Authenticate. Installing it in Codex does not install a ChatGPT web
                      app.
                    </p>
                    {url && (
                      <CopyBlock
                        label="Codex CLI alternative"
                        value={mcpSetupCommand('codex', url)}
                      />
                    )}
                  </>
                )}
                {client === 'claude' && (
                  <p>
                    In Claude’s Connectors settings, add a custom web connector named Outbound OS
                    using this URL and OAuth. Complete authorization and enable the connector in
                    your conversation.
                  </p>
                )}
                {client === 'claude-code' && url && (
                  <CopyBlock
                    label="Claude Code command · then use /mcp to authenticate"
                    value={mcpSetupCommand('claude-code', url)}
                  />
                )}
                {client === 'other' && url && (
                  <>
                    <p>
                      Use Streamable HTTP and OAuth discovery where supported. Bearer-only clients
                      need a separately provisioned secret; this page does not issue it.
                    </p>
                    <CopyBlock
                      label="Bearer configuration reference · legacy only"
                      value={mcpReferenceConfiguration(url)}
                    />
                  </>
                )}
              </div>
            </details>
            <div className="border-t border-border pt-5">
              <h2 className="mb-3 text-sm font-semibold text-text-primary">
                3. Verify with a read-only request
              </h2>
              <CopyBlock label="Connection test prompt" value={VERIFY_PROMPT} />
            </div>
          </section>
          <aside className="space-y-4">
            <section className="rounded-xl border border-border bg-surface p-5">
              <h2 className="flex items-center gap-2 text-sm font-semibold text-text-primary">
                <ShieldCheck className="h-4 w-4" aria-hidden="true" /> Your access, under your
                control
              </h2>
              <p className="mt-3 text-xs leading-6 text-text-secondary">
                {personal
                  ? 'A personal workspace administrator signs in normally and explicitly approves each client. New personal connections can read CRM data; message sending and changes are not enabled in this first version. Revoke each client separately in Connected apps.'
                  : 'Legacy connections use a separate integration password and shared administrator access. The server administrator must configure and validate personal authorization before new connections can use normal dashboard sign-in. Existing access stays unchanged until that rollout.'}
              </p>
            </section>
            <section className="rounded-xl border border-border bg-surface p-5">
              <h2 className="text-sm font-semibold text-text-primary">Connection help</h2>
              <div className="mt-3 space-y-3 text-xs leading-6 text-text-secondary">
                <p>
                  <strong className="text-text-primary">Server unreachable?</strong> Your AI
                  provider must reach the public HTTPS endpoint. A VPN connection on your computer
                  does not grant the provider network access.
                </p>
                <p>
                  <strong className="text-text-primary">Request expired or cancelled?</strong> Start
                  Authenticate again in the AI client. This page never automatically approves
                  access.
                </p>
                <p>
                  <strong className="text-text-primary">No tools after connecting?</strong>{' '}
                  Reconnect or refresh the tool list in the AI client. A successful test request
                  confirms tool access.
                </p>
              </div>
            </section>
            <details className="rounded-xl border border-border bg-surface p-5">
              <summary className="cursor-pointer text-sm font-medium text-text-primary">
                Server diagnostics
              </summary>
              <p className="mt-3 text-xs leading-6 text-text-secondary">
                {connection.isError
                  ? 'The server check failed. Previously loaded details may be stale.'
                  : data?.health.message || 'Checking configuration…'}
              </p>
              <p className="mt-2 text-xs text-text-muted">
                Transport: Streamable HTTP · OAuth discovery:{' '}
                {data?.oauth.available ? 'Available' : 'Not verified'}
              </p>
            </details>
          </aside>
        </div>
      ) : (
        <section className="rounded-xl border border-border bg-surface p-5 sm:p-6">
          <h2 className="text-base font-semibold text-text-primary">Your authorized clients</h2>
          <p className="mt-1 text-sm leading-6 text-text-secondary">
            Revoking a personal connection stops its existing tokens and future refreshes. Removing
            it in your AI client alone does not revoke server access.
          </p>
          {!isAdmin ? (
            <p className="mt-5 text-sm text-text-secondary">
              A personal workspace administrator manages AI authorizations in this first version.
            </p>
          ) : grants.isPending ? (
            <p role="status" className="mt-5 text-sm text-text-secondary">
              Loading connections…
            </p>
          ) : grants.isError ? (
            <p role="alert" className="mt-5 text-sm text-danger">
              Connections could not be loaded. {grants.error.message}
            </p>
          ) : grants.data?.mode !== 'personal' ? (
            <div className="mt-5 rounded-lg border border-border bg-background p-5 text-sm leading-6 text-text-secondary">
              This deployment still uses legacy shared credentials, which have no recorded personal
              owner or per-client inventory. Ask the administrator to activate personal
              authorization and reconnect each client. No connected clients are inferred from server
              reachability.
            </div>
          ) : !grants.data.grants.length ? (
            <div className="mt-5 rounded-lg border border-dashed border-border p-8 text-center">
              <Bot className="mx-auto h-6 w-6 text-text-muted" aria-hidden="true" />
              <p className="mt-3 text-sm font-medium text-text-primary">
                No personal connections yet
              </p>
              <p className="mt-1 text-xs text-text-secondary">
                Connect an AI client and approve read-only access to see it here.
              </p>
              <Button variant="secondary" className="mt-4" onClick={() => setTab('connect')}>
                Connect an agent
              </Button>
            </div>
          ) : (
            <div className="mt-5 divide-y divide-border">
              {grants.data.grants.map((grant) => (
                <div
                  key={grant.id}
                  className="flex flex-wrap items-center justify-between gap-4 py-4"
                >
                  <div className="min-w-0">
                    <p className="font-medium text-text-primary">{grant.clientName}</p>
                    <p className="mt-1 break-all text-xs text-text-muted">
                      {grant.callbackHost} · Read-only ·{' '}
                      {grant.revokedAt
                        ? 'Revoked'
                        : grant.expiresAt <= Date.now()
                          ? 'Expired'
                          : grant.lastToolAt
                            ? 'Tools used'
                            : 'Authorized · waiting for first tool'}
                    </p>
                    <p className="mt-1 text-xs text-text-muted">
                      Authorized {new Date(grant.createdAt).toLocaleDateString()} ·{' '}
                      {grant.lastToolAt
                        ? `Last successful tool ${new Date(grant.lastToolAt).toLocaleString()}`
                        : 'No successful tool request recorded'}
                    </p>
                  </div>
                  {!grant.revokedAt && grant.expiresAt > Date.now() && (
                    <Button
                      variant="secondary"
                      size="sm"
                      disabled={revoking !== null}
                      pending={revoking === grant.id}
                      pendingLabel="Revoking…"
                      onClick={() => void revoke(grant.id)}
                    >
                      Revoke access
                    </Button>
                  )}
                </div>
              ))}
            </div>
          )}
        </section>
      )}
    </div>
  )
}
