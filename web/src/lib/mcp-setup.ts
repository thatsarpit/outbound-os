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

export function mcpSetupPrompt(client: string, serverUrl: string): string {
  const label =
    (
      {
        chatgpt: 'ChatGPT',
        codex: 'Codex',
        claude: 'Claude',
        'claude-code': 'Claude Code',
      } as Record<string, string>
    )[client] || 'my AI client'
  return `Help me connect Outbound OS to ${label}.\nMCP server: ${serverUrl}\nTransport: Streamable HTTP. Authentication: OAuth with S256 PKCE and automatic client registration.\nGuide me through any client settings and let me personally review the Outbound OS authorization screen. Do not ask me to paste passwords, session tokens or API keys into this conversation.\nAfter I authorize the connection, run system_status and whatsapp_accounts and report the result. Do not send messages, start campaigns, import leads or change any CRM data. If this client cannot install a connection from a prompt, explain the manual setup steps.`
}
