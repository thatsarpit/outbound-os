# AI agents & MCP setup

Open **Integrations → AI agents & MCP** with a manager/admin dashboard role.
Choose a provider and client, copy the setup prompt or expand manual setup, then
verify with the separate read-only test prompt. ChatGPT and Codex appear under
OpenAI but create independent connections.

The server panel reports bounded HTTPS health/OAuth discovery. It does not prove
that a client is installed, authorized or able to use tools. Public connection
details contain no service or client credentials. The connected-app list uses
actual personal grants and recorded tool activity, never inferred sessions.

Existing deployments remain in legacy shared-integration mode. The page labels
its separate password and shared administrator authority truthfully; no personal
owner is invented for old credentials. Personal authorization is an explicit
opt-in release described in [Personal MCP authorization](mcp-personal-authorization.md).
That first version uses existing dashboard sign-in, explicit administrator
approval, read-only scope, personal grant inventory and immediate revocation.

Set `MCP_PUBLIC_URL` to the canonical HTTPS `/mcp` endpoint. This setting alone
starts no service and changes no authentication. OAuth discovery must advertise
S256 PKCE and same-origin authorization/token endpoints. Reachability checks do
not follow redirects, transmit credentials or send messages.

Official references: [Codex MCP](https://learn.chatgpt.com/docs/extend/mcp) and
[ChatGPT custom MCP setup](https://developers.openai.com/api/docs/guides/custom-mcp-server).
Client labels and workspace policies vary. A setup prompt guides the user; it
does not guarantee installation or bypass personal authorization.
