import { api } from '../client'

export interface McpConnectionInfo {
  serverUrl: string | null
  backendConfigured: boolean
  transport: 'streamable-http'
  authentication: Array<'oauth' | 'bearer'>
  health: {
    status: 'reachable' | 'unreachable' | 'not_configured'
    checkedAt: string | null
    message: string
  }
  oauth: { available: boolean }
}

export const mcpApi = {
  connection: async () => {
    const info = await api.get<McpConnectionInfo>('/integrations/mcp')
    if (!info) throw new Error('The server returned no MCP connection details.')
    return info
  },
}
