import type { McpConnectionInfo, McpGrant } from '@/api/endpoints/mcp'

const grants: McpGrant[] = [
  {
    id: 'sample-codex-grant',
    clientName: 'Codex · sample connection',
    callbackHost: '127.0.0.1:34567',
    scope: 'mcp:read',
    createdAt: Date.now() - 86_400_000,
    expiresAt: Date.now() + 7 * 86_400_000,
    revokedAt: null,
    lastToolAt: Date.now() - 5 * 60_000,
  },
]
const json = (body: unknown, status = 200) =>
  new Response(JSON.stringify(body), {
    status,
    headers: { 'Content-Type': 'application/json' },
  })

/** Fictional connection state never probes or authorizes an external MCP server. */
export function handleDemoMcpRequest(url: string, init?: RequestInit): Response | null {
  const path = new URL(url, 'https://demo.example.test').pathname
  if (!path.startsWith('/api/integrations/mcp')) return null
  const method = (init?.method || 'GET').toUpperCase()
  if (path === '/api/integrations/mcp' && method === 'GET') {
    const info: McpConnectionInfo = {
      serverUrl: 'https://mcp.example.test/mcp',
      backendConfigured: true,
      transport: 'streamable-http',
      authentication: ['oauth'],
      authorizationMode: 'personal',
      legacyCompatibility: false,
      health: {
        status: 'reachable',
        checkedAt: new Date().toISOString(),
        message: 'Sample connection state. No real server was checked.',
      },
      oauth: { available: true },
    }
    return json(info)
  }
  if (path === '/api/integrations/mcp/grants' && method === 'GET')
    return json({ mode: 'personal', readOnly: true, grants })
  const revoke = path.match(/^\/api\/integrations\/mcp\/grants\/([^/]+)$/)
  if (revoke && method === 'DELETE') {
    const grant = grants.find((item) => item.id === decodeURIComponent(revoke[1]))
    if (!grant) return json({ error: 'Sample connection not found.' }, 404)
    grant.revokedAt ??= Date.now()
    return json({ ok: true })
  }
  return json(
    {
      error:
        'OAuth authorization is disabled in this sample workspace. Connect your own installation to authorize an AI client.',
    },
    409,
  )
}
