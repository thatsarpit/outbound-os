# AI agents & MCP setup

Open **Integrations → AI agents & MCP** with a manager/admin dashboard role.
The page has the configured URL, a server check, instructions for ChatGPT, Codex
and other clients, and a read-only verification prompt.

Set `MCP_PUBLIC_URL=https://mcp.your-domain.example/mcp` on the API deployment to
advertise an existing HTTPS MCP service. This setting does not start that service
or change its authentication. Run the MCP container with the matching API service
credential and its own client/OAuth credentials as described in the MCP guide.

The page distinguishes three things:

- Backend configuration: the API has a service credential. Its value is never shown.
- Reachability and discovery: bounded unauthenticated GETs to the explicitly
  configured MCP server. Requests do not follow redirects, accept arbitrary request
  destinations, transmit secrets or send messages. OAuth discovery must advertise
  PKCE S256 and same-origin authorization/token endpoints.
- Client authorization: completed inside the AI client and the MCP authorization
  page. A successful read-only tool call verifies the full route to the CRM.
  A green server badge alone does not prove credentials or an AI session work.

The current MCP uses shared integration access rather than personal dashboard
roles. Do not treat it as a per-agent read-only token or role inheritance. Configure
client tool approvals before authorizing changes. This page does not issue
credentials, enumerate client sessions or revoke them; those require separate
server-side identity/session work.

Official setup references (checked for this release):
[Codex MCP](https://learn.chatgpt.com/docs/extend/mcp) and
[ChatGPT MCP authentication](https://developers.openai.com/plugins/build/auth).
Client screens and workspace policy may differ. Codex's local MCP configuration
and ChatGPT web plugin installation are distinct setup steps.
