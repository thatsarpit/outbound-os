import { useState } from 'react'
import { useQuery } from '@tanstack/react-query'
import {
  Bot,
  CheckCircle2,
  CircleHelp,
  Copy,
  ExternalLink,
  KeyRound,
  Loader2,
  RefreshCw,
  ShieldCheck,
  Terminal,
  Unplug,
} from 'lucide-react'
import { mcpApi } from '@/api/endpoints/mcp'
import { Button } from '@/components/ui'
import { cn } from '@/lib/utils'
import { mcpReferenceConfiguration, mcpSetupCommand } from '@/lib/mcp-setup'
import { toast } from '@/stores/toast-store'

type Client = 'chatgpt' | 'codex' | 'claude' | 'claude-code' | 'other'

const CLIENTS: Array<{ id: Client; name: string; detail: string }> = [
  { id: 'chatgpt', name: 'ChatGPT', detail: 'Custom MCP plugin' },
  { id: 'codex', name: 'Codex', detail: 'Desktop, CLI & IDE' },
  { id: 'claude', name: 'Claude', detail: 'Web & desktop' },
  { id: 'claude-code', name: 'Claude Code', detail: 'Command line' },
  { id: 'other', name: 'Other agents', detail: 'Remote MCP client' },
]

const VERIFY_PROMPT =
  'Use Outbound OS to run system_status and whatsapp_accounts. Report the connection status. Do not send messages, start campaigns, import leads, or change any data.'

async function copyText(text: string) {
  try {
    await navigator.clipboard.writeText(text)
    toast.success('Copied to clipboard')
  } catch {
    toast.error('Copy was unavailable. Select the text and copy it manually.')
  }
}

function CopyBlock({ label, value }: { label: string; value: string }) {
  return (
    <div className="min-w-0 rounded-lg border border-border bg-background">
      <div className="flex items-center justify-between gap-3 border-b border-border px-4 py-2">
        <span className="text-xs font-medium text-text-secondary">{label}</span>
        <Button
          variant="ghost"
          size="sm"
          onClick={() => void copyText(value)}
          aria-label={`Copy ${label}`}
        >
          <Copy aria-hidden="true" className="h-3.5 w-3.5" /> Copy
        </Button>
      </div>
      <pre className="overflow-x-auto whitespace-pre-wrap break-all px-4 py-3 font-mono text-xs leading-6 text-text-primary">
        <code>{value}</code>
      </pre>
    </div>
  )
}

function HelpLink({ href, children }: { href: string; children: React.ReactNode }) {
  return (
    <a
      href={href}
      target="_blank"
      rel="noreferrer"
      className="inline-flex items-center gap-1.5 text-xs font-medium text-text-primary underline decoration-border-strong underline-offset-4 hover:decoration-current"
    >
      {children}
      <ExternalLink aria-hidden="true" className="h-3 w-3" />
    </a>
  )
}

export default function McpIntegrationPage() {
  const [client, setClient] = useState<Client>('chatgpt')
  const { data, isPending, isError, isFetching, refetch } = useQuery({
    queryKey: ['mcp-connection'],
    queryFn: mcpApi.connection,
    staleTime: 60_000,
    retry: false,
    meta: { silent: true },
  })

  const serverUrl = data?.serverUrl
  const reachable = !isError && data?.health.status === 'reachable'
  const healthLabel = isError
    ? 'Status unavailable'
    : isPending
      ? 'Checking server…'
      : reachable
        ? 'Server reachable'
        : data?.health.status === 'not_configured'
          ? 'Setup needed'
          : 'Server unreachable'
  const HealthIcon = isPending ? Loader2 : reachable ? CheckCircle2 : Unplug
  const oauthAvailable = !isError && data?.oauth.available

  return (
    <div className="space-y-5">
      <section
        className="overflow-hidden rounded-lg border border-border bg-surface"
        aria-labelledby="mcp-title"
      >
        <div className="flex flex-wrap items-start justify-between gap-4 p-5 sm:p-6">
          <div className="flex items-start gap-3">
            <div className="flex h-11 w-11 shrink-0 items-center justify-center rounded-lg border border-border bg-background">
              <Bot aria-hidden="true" className="h-5 w-5 text-text-primary" />
            </div>
            <div>
              <h2 id="mcp-title" className="text-base font-semibold text-text-primary">
                Your CRM, in your AI agent
              </h2>
              <p className="mt-1 max-w-xl text-sm leading-6 text-text-secondary">
                Connect an AI client to this workspace to review leads, inspect conversations and
                manage outreach through MCP.
              </p>
            </div>
          </div>
          <span
            role="status"
            className={cn(
              'inline-flex items-center gap-1.5 rounded-full px-2.5 py-1 text-xs font-medium',
              reachable
                ? 'bg-success-muted text-success'
                : isError || data?.health.status === 'unreachable'
                  ? 'bg-danger-muted text-danger'
                  : 'bg-surface-raised text-text-secondary',
            )}
          >
            <HealthIcon
              aria-hidden="true"
              className={cn('h-3.5 w-3.5', isPending && 'animate-spin')}
            />
            {healthLabel}
          </span>
        </div>

        <div className="grid gap-px border-y border-border bg-border sm:grid-cols-3">
          {[
            ['Transport', 'Streamable HTTP', 'A remote MCP endpoint'],
            [
              'Sign-in',
              oauthAvailable ? 'OAuth discovered' : isPending ? 'Checking…' : 'See server status',
              'Authorize inside your AI client',
            ],
            ['Access', 'This workspace', 'Shared integration permissions'],
          ].map(([label, value, detail]) => (
            <div key={label} className="bg-surface px-5 py-4 sm:px-6">
              <p className="text-[10px] font-semibold uppercase tracking-wider text-text-muted">
                {label}
              </p>
              <p className="mt-1 text-sm font-semibold text-text-primary">{value}</p>
              <p className="mt-1 text-xs text-text-muted">{detail}</p>
            </div>
          ))}
        </div>

        <div className="space-y-3 p-5 sm:p-6">
          {serverUrl ? (
            <CopyBlock label="MCP server URL" value={serverUrl} />
          ) : (
            <div className="rounded-lg border border-dashed border-border p-4 text-sm leading-6 text-text-secondary">
              {isPending
                ? 'Loading this workspace’s server URL…'
                : isError
                  ? 'Connection details could not be loaded. Try checking again.'
                  : 'The public MCP URL has not been configured. Your server administrator needs to set MCP_PUBLIC_URL to the HTTPS /mcp endpoint and restart the API.'}
            </div>
          )}
          <div className="flex flex-wrap items-center justify-between gap-3">
            <p className="max-w-2xl text-xs leading-5 text-text-secondary">
              {isError
                ? 'The server check failed. Previously loaded details may be out of date.'
                : data?.health.message}
              {data?.health.checkedAt && !isError && (
                <>
                  {' '}
                  Checked{' '}
                  {new Date(data.health.checkedAt).toLocaleTimeString([], {
                    hour: '2-digit',
                    minute: '2-digit',
                  })}
                  .
                </>
              )}
            </p>
            <Button
              variant="secondary"
              size="sm"
              onClick={() => void refetch()}
              pending={isFetching}
              pendingLabel="Checking…"
            >
              <RefreshCw aria-hidden="true" className="h-3.5 w-3.5" /> Check server
            </Button>
          </div>
          <p className="text-xs leading-5 text-text-muted">
            This checks the server and OAuth discovery. It does not confirm that your AI client is
            signed in.
          </p>
          {data && !data.backendConfigured && (
            <p className="text-xs leading-5 text-warning">
              The API’s MCP service credential is missing. A server administrator must finish the
              backend configuration before tools can access this workspace.
            </p>
          )}
        </div>
      </section>

      <div className="grid gap-5 2xl:grid-cols-[minmax(0,1.6fr)_minmax(280px,1fr)]">
        <section
          className="min-w-0 rounded-lg border border-border bg-surface p-5 sm:p-6"
          aria-labelledby="mcp-connect-title"
        >
          <p className="text-[10px] font-semibold uppercase tracking-wider text-text-muted">
            Connect in a few steps
          </p>
          <h2 id="mcp-connect-title" className="mt-1 text-sm font-semibold text-text-primary">
            Choose your AI client
          </h2>
          <div
            className="mt-4 grid grid-cols-2 gap-2 lg:grid-cols-3"
            role="group"
            aria-label="AI client"
          >
            {CLIENTS.map((item) => (
              <button
                key={item.id}
                type="button"
                aria-pressed={client === item.id}
                onClick={() => setClient(item.id)}
                className={cn(
                  'rounded-md border px-3 py-3 text-left transition-colors focus-visible:outline focus-visible:outline-2 focus-visible:outline-accent',
                  client === item.id
                    ? 'border-text-primary bg-surface-raised'
                    : 'border-border hover:border-border-strong',
                )}
              >
                <span className="block text-xs font-semibold text-text-primary">{item.name}</span>
                <span className="mt-1 block text-[11px] text-text-muted">{item.detail}</span>
              </button>
            ))}
          </div>

          <div className="mt-5 space-y-4 text-sm leading-6 text-text-secondary">
            {client === 'claude' && (
              <>
                <ol className="list-decimal space-y-2 pl-5">
                  <li>
                    Open Claude’s{' '}
                    <strong className="font-medium text-text-primary">Connectors</strong> settings
                    and add a custom web connector named Outbound OS.
                  </li>
                  <li>
                    Paste the MCP server URL above. Choose OAuth sign-in and automatic client
                    registration if prompted.
                  </li>
                  <li>
                    Complete the Outbound OS authorization page, then enable the connector in your
                    conversation.
                  </li>
                </ol>
                <HelpLink href="https://support.claude.com/en/articles/11175166-get-started-with-custom-connectors-using-remote-mcp">
                  Claude connection guide
                </HelpLink>
              </>
            )}
            {client === 'chatgpt' && (
              <>
                <ol className="list-decimal space-y-2 pl-5">
                  <li>
                    On ChatGPT web, open{' '}
                    <strong className="font-medium text-text-primary">Plugins</strong>, select the
                    plus button and choose{' '}
                    <strong className="font-medium text-text-primary">Add custom MCP server</strong>
                    .
                  </li>
                  <li>
                    Name it Outbound OS, paste the server URL and select OAuth. Use automatic
                    registration (DCR) if asked.
                  </li>
                  <li>
                    Authorize and create the plugin, then install it. Select it with{' '}
                    <code className="font-mono text-xs text-text-primary">@</code> in your
                    conversation.
                  </li>
                </ol>
                <p className="text-xs leading-5 text-text-muted">
                  Some versions use the name Apps. Workspace permissions and security restrictions
                  apply. Adding the server in Codex does not install a ChatGPT web plugin.
                </p>
                <HelpLink href="https://chatgpt.com/plugins">Open ChatGPT Plugins</HelpLink>
                <br />
                <HelpLink href="https://developers.openai.com/api/docs/guides/custom-mcp-server">
                  Official ChatGPT setup guide
                </HelpLink>
              </>
            )}
            {client === 'codex' && (
              <>
                <ol className="list-decimal space-y-2 pl-5">
                  <li>
                    In the desktop app or IDE, open{' '}
                    <strong className="font-medium text-text-primary">
                      Settings → MCP servers → Add server
                    </strong>
                    .
                  </li>
                  <li>
                    Name it Outbound OS, choose{' '}
                    <strong className="font-medium text-text-primary">Streamable HTTP</strong> and
                    paste the server URL.
                  </li>
                  <li>
                    Save, restart the connection and choose{' '}
                    <strong className="font-medium text-text-primary">Authenticate</strong>. Check{' '}
                    <code className="font-mono text-xs text-text-primary">/mcp</code> for its
                    status.
                  </li>
                </ol>
                {serverUrl && (
                  <CopyBlock
                    label="Alternative · Codex CLI"
                    value={mcpSetupCommand('codex', serverUrl)}
                  />
                )}
                <p className="text-xs leading-5 text-text-muted">
                  The desktop app, CLI and IDE share local MCP configuration. The OAuth sign-in
                  stores access in your client; this page receives no credentials.
                </p>
                <HelpLink href="https://learn.chatgpt.com/docs/extend/mcp">
                  Official Codex MCP guide
                </HelpLink>
              </>
            )}
            {client === 'claude-code' && (
              <>
                <p>
                  Add the remote server, then use{' '}
                  <code className="font-mono text-xs text-text-primary">/mcp</code> inside Claude
                  Code to sign in through OAuth.
                </p>
                {serverUrl && (
                  <CopyBlock
                    label="Claude Code command"
                    value={mcpSetupCommand('claude-code', serverUrl)}
                  />
                )}
                <HelpLink href="https://code.claude.com/docs/en/mcp">
                  Claude Code MCP guide
                </HelpLink>
              </>
            )}
            {client === 'other' && (
              <>
                <ol className="list-decimal space-y-2 pl-5">
                  <li>Add a remote MCP server using Streamable HTTP and the URL above.</li>
                  <li>Prefer OAuth if your agent supports discovery and automatic registration.</li>
                  <li>
                    For bearer-only clients, ask the server administrator to provision an
                    appropriate credential through a secure channel. Keep it in the agent’s secret
                    store.
                  </li>
                </ol>
                {serverUrl && (
                  <CopyBlock
                    label="Reference JSON · adapt to your client"
                    value={mcpReferenceConfiguration(serverUrl)}
                  />
                )}
                <p className="text-xs leading-5 text-text-muted">
                  Client configuration formats vary. Replace the placeholder in your agent, never in
                  a public repository. This dashboard does not issue or display bearer tokens.
                </p>
              </>
            )}
          </div>

          <div className="mt-6 border-t border-border pt-5">
            <h3 className="flex items-center gap-2 text-sm font-semibold text-text-primary">
              <ShieldCheck aria-hidden="true" className="h-4 w-4" /> Verify with a read-only request
            </h3>
            <p className="mb-3 mt-1 text-xs leading-5 text-text-secondary">
              After connecting, paste this into your AI client. A successful tool response confirms
              the full connection.
            </p>
            <CopyBlock label="Connection test prompt" value={VERIFY_PROMPT} />
          </div>
        </section>

        <aside className="space-y-4">
          <section className="rounded-lg border border-border bg-surface p-5">
            <h2 className="flex items-center gap-2 text-sm font-semibold text-text-primary">
              <KeyRound aria-hidden="true" className="h-4 w-4" /> Know what you are authorizing
            </h2>
            <p className="mt-3 text-xs leading-6 text-text-secondary">
              This is a shared workspace integration. Authorized clients can access CRM data and use
              tools that send messages, import leads and change campaigns. They do not inherit your
              personal dashboard role.
            </p>
            <p className="mt-3 text-xs leading-6 text-text-secondary">
              The OAuth page uses the integration password set by your server administrator. It is
              separate from your dashboard login. Enter it only on your MCP server’s authorization
              page.
            </p>
            <p className="mt-3 text-xs leading-6 text-text-secondary">
              Review your agent’s tool approvals before allowing send or campaign actions. The
              server check above sends no customer messages.
            </p>
          </section>
          <section className="rounded-lg border border-border bg-surface p-5">
            <h2 className="flex items-center gap-2 text-sm font-semibold text-text-primary">
              <CircleHelp aria-hidden="true" className="h-4 w-4" /> Connection troubleshooting
            </h2>
            <div className="mt-3 space-y-3 text-xs leading-5 text-text-secondary">
              <p>
                <strong className="font-medium text-text-primary">Cannot reach the server?</strong>{' '}
                Your AI provider must be able to reach its HTTPS URL. A private address needs a
                tunnel supported by your client; being connected to your own VPN is not enough.
              </p>
              <p>
                <strong className="font-medium text-text-primary">Sign-in fails?</strong> Ask the
                administrator to check the integration password and OAuth settings. Dashboard
                sign-in does not authorize an AI client.
              </p>
              <p>
                <strong className="font-medium text-text-primary">Tools are missing?</strong>{' '}
                Refresh the connector’s tools or reconnect in your AI client after an MCP update.
              </p>
            </div>
          </section>
          <div className="flex gap-3 rounded-lg border border-border bg-surface-raised p-4">
            <Terminal aria-hidden="true" className="mt-0.5 h-4 w-4 shrink-0 text-text-muted" />
            <p className="text-xs leading-5 text-text-secondary">
              Client sessions and revocation are managed outside this page. Reachable server status
              is not an inventory of connected agents.
            </p>
          </div>
        </aside>
      </div>
    </div>
  )
}
