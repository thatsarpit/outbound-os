import { api } from '../client'

export interface McpConnectionInfo {
  serverUrl: string | null
  backendConfigured: boolean
  transport: 'streamable-http'
  authentication: Array<'oauth' | 'bearer'>
  authorizationMode?: 'legacy' | 'personal'
  legacyCompatibility?: boolean
  health: {
    status: 'reachable' | 'unreachable' | 'not_configured'
    checkedAt: string | null
    message: string
  }
  oauth: { available: boolean }
}

export interface McpGrant {
  id: string
  clientName: string
  callbackHost: string
  scope: string
  createdAt: number
  expiresAt: number
  revokedAt: number | null
  lastToolAt: number | null
}

export interface McpAuthorizationRequest {
  id: string
  clientName: string
  callbackHost: string
  verifiedClient: boolean
  scope: string
  workspace: string
  expiresAt: number
  person: { name: string; email: string; role: string }
  decisionNonce: string
}

export const mcpApi = {
  connection: async () => {
    const info = await api.get<McpConnectionInfo>('/integrations/mcp')
    if (!info) throw new Error('The server returned no MCP connection details.')
    return info
  },
  grants: () =>
    api.get<{ mode: 'legacy' | 'personal'; readOnly: boolean; grants: McpGrant[] }>(
      '/integrations/mcp/grants',
    ),
  revoke: (id: string) => api.delete(`/integrations/mcp/grants/${encodeURIComponent(id)}`),
  authorization: (id: string) =>
    api.get<McpAuthorizationRequest>(`/integrations/mcp/authorization/${encodeURIComponent(id)}`),
  decide: (id: string, decision: 'allow' | 'deny', decisionNonce: string) =>
    api.post<{ completionUrl: string }>(
      `/integrations/mcp/authorization/${encodeURIComponent(id)}`,
      { decision, decisionNonce },
    ),
}
