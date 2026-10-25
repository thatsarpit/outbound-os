import { useState } from 'react'
import { useSearchParams, Link } from 'react-router-dom'
import { useQuery } from '@tanstack/react-query'
import { Bot, ShieldCheck, AlertTriangle, ArrowLeft } from 'lucide-react'
import { mcpApi } from '@/api/endpoints/mcp'
import { Button } from '@/components/ui'
import { useAuthStore } from '@/stores/auth-store'

export default function McpAuthorizePage() {
  const [params] = useSearchParams()
  const requestId = params.get('request_id') || ''
  const scope = useAuthStore((state) => state.dashboardScope)
  const [pending, setPending] = useState(false)
  const [error, setError] = useState('')
  const validId = /^[\w-]{43}$/.test(requestId) && params.getAll('request_id').length === 1
  const request = useQuery({
    queryKey: ['mcp-authorization', requestId, scope],
    queryFn: () => mcpApi.authorization(requestId),
    enabled: validId,
    retry: false,
    refetchOnWindowFocus: false,
    staleTime: Infinity,
    gcTime: 0,
  })

  async function decide(decision: 'allow' | 'deny') {
    if (!request.data || pending) return
    setPending(true)
    setError('')
    try {
      const result = await mcpApi.decide(requestId, decision, request.data.decisionNonce)
      if (!result) throw new Error('The decision could not be saved. Try again.')
      // The completion destination is server-configured. No client callback or
      // credential is accepted from route parameters or browser storage.
      window.location.assign(result.completionUrl)
    } catch (failure) {
      setError(
        failure instanceof Error ? failure.message : 'The connection could not be authorized.',
      )
      setPending(false)
    }
  }

  const failure = !validId
    ? 'This connection link is invalid. Start again in your AI client.'
    : request.isError
      ? request.error.message
      : ''
  return (
    <div className="mx-auto max-w-xl space-y-5 py-6 sm:py-10">
      <Link
        to="/integrations/mcp"
        className="inline-flex items-center gap-2 text-sm text-text-secondary"
      >
        <ArrowLeft className="h-4 w-4" aria-hidden="true" /> AI connections
      </Link>
      <section className="overflow-hidden rounded-xl border border-border bg-surface">
        <div className="border-b border-border p-6">
          <div className="mb-4 flex h-11 w-11 items-center justify-center rounded-lg border border-border bg-surface-raised">
            <Bot className="h-5 w-5" aria-hidden="true" />
          </div>
          <h1 className="text-xl font-semibold text-text-primary">Connect your AI client</h1>
          <p className="mt-2 text-sm leading-6 text-text-secondary">
            Review this request before allowing access to your workspace.
          </p>
        </div>
        <div className="space-y-5 p-6">
          {request.isPending && validId && (
            <p role="status" className="text-sm text-text-secondary">
              Loading connection request…
            </p>
          )}
          {failure && (
            <p role="alert" className="text-sm leading-6 text-danger">
              {failure}
            </p>
          )}
          {request.data ? (
            <>
              <div>
                <p className="text-lg font-semibold text-text-primary">{request.data.clientName}</p>
                <p className="mt-1 text-xs text-text-muted">
                  Unverified client name · callback {request.data.callbackHost}
                </p>
              </div>
              <div className="rounded-lg border border-border bg-background p-4 text-sm">
                <p className="font-medium text-text-primary">
                  {request.data.person.name || request.data.person.email}
                </p>
                <p className="mt-1 text-text-secondary">{request.data.person.email}</p>
                <p className="mt-2 text-xs text-text-muted">
                  Workspace: {request.data.workspace} · Current role: {request.data.person.role}
                </p>
              </div>
              <div>
                <h2 className="flex items-center gap-2 text-sm font-semibold text-text-primary">
                  <ShieldCheck className="h-4 w-4" aria-hidden="true" /> Read-only CRM access
                </h2>
                <p className="mt-2 text-sm leading-6 text-text-secondary">
                  Read leads, conversations, campaigns, team details and reports. This connection
                  cannot send messages, edit records or start campaigns. Access stops if you revoke
                  it or lose administrator access.
                </p>
              </div>
              <p className="flex gap-2 text-xs leading-5 text-text-secondary">
                <AlertTriangle
                  className="mt-0.5 h-4 w-4 shrink-0 text-warning"
                  aria-hidden="true"
                />{' '}
                Only allow this request if you started it in your AI client. The client receives CRM
                data when you use its tools.
              </p>
              <p className="text-xs text-text-muted">
                Request expires{' '}
                {new Date(request.data.expiresAt).toLocaleTimeString([], {
                  hour: '2-digit',
                  minute: '2-digit',
                })}
                . You can revoke this connection in AI agents & MCP.
              </p>
              {error && (
                <p role="alert" className="text-sm text-danger">
                  {error}
                </p>
              )}
              <div className="flex flex-wrap justify-end gap-3 border-t border-border pt-5">
                <Button variant="secondary" disabled={pending} onClick={() => void decide('deny')}>
                  Cancel
                </Button>
                <Button
                  disabled={pending}
                  pending={pending}
                  pendingLabel="Saving…"
                  onClick={() => void decide('allow')}
                >
                  Allow read-only access
                </Button>
              </div>
            </>
          ) : null}
        </div>
      </section>
    </div>
  )
}
