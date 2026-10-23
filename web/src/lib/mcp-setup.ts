/** Keep a copied URL inert when the user pastes a setup command into a shell. */
function shellArgument(value: string): string {
  return `'${value.replace(/'/g, "'\"'\"'")}'`
}

export function mcpSetupCommand(client: 'codex' | 'claude-code', serverUrl: string): string {
  return client === 'codex'
    ? `codex mcp add outbound-os --url ${shellArgument(serverUrl)}\ncodex mcp login outbound-os`
    : `claude mcp add --transport http outbound-os ${shellArgument(serverUrl)}`
}

export function mcpReferenceConfiguration(serverUrl: string): string {
  return JSON.stringify(
    {
      mcpServers: {
        'outbound-os': {
          type: 'http',
          url: serverUrl,
          headers: { Authorization: 'Bearer <MCP_CLIENT_TOKEN>' },
        },
      },
    },
    null,
    2,
  )
}
