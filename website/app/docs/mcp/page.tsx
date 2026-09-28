import Link from 'next/link'
import { Code } from '@/components/content'
import { DocsShell, docMetadata } from '@/components/docs-shell'

export const metadata = docMetadata('mcp')

export default function McpDoc() {
  return (
    <DocsShell slug="mcp">
      <p>
        The MCP server lets Claude and other{' '}
        <a href="https://modelcontextprotocol.io">Model Context Protocol</a>{' '}
        clients use your CRM through a fixed set of tools — listing leads,
        importing lists, building campaigns, reading analytics. It runs as a
        second container next to the app and is off until you start it.{' '}
        <Link href="/mcp">See every tool</Link>.
      </p>

      <h2 id="tokens">1. Add two tokens</h2>
      <p>Generate two random values and add them to <code>.env</code>:</p>
      <Code label="Terminal">{'openssl rand -hex 32   # run twice'}</Code>
      <Code label=".env">{'MCP_SERVICE_TOKEN=<first value>\nMCP_BEARER_TOKEN=<second value>'}</Code>
      <ul>
        <li>
          <code>MCP_SERVICE_TOKEN</code> lets the MCP server call the Outbound
          OS API. Both containers read it from the same <code>.env</code>.
        </li>
        <li>
          <code>MCP_BEARER_TOKEN</code> is what AI clients present. It is also
          the password on the sign-in step when claude.ai connects, unless you
          set a separate <code>OAUTH_PASSWORD</code>.
        </li>
      </ul>

      <h2 id="start">2. Start the MCP server</h2>
      <Code label="Terminal">{'docker compose --profile mcp up -d'}</Code>
      <p>
        It listens on port 3010 (change it with <code>OUTBOUNDOS_MCP_PORT</code>).
        Check it is up with <code>curl http://localhost:3010/healthz</code>.
      </p>

      <h2 id="https">3. Give it an HTTPS address</h2>
      <p>
        Remote clients such as claude.ai need HTTPS. Add a second site to your
        reverse proxy, for example with Caddy:
      </p>
      <Code label="Caddyfile">{'mcp.example.com {\n  reverse_proxy localhost:3010\n}'}</Code>

      <h2 id="claude-code">4a. Connect Claude Code</h2>
      <Code label="Terminal">
        {'claude mcp add --transport http outbound-os \\\n  https://mcp.example.com/mcp \\\n  --header "Authorization: Bearer <MCP_BEARER_TOKEN>"'}
      </Code>
      <p>
        Then ask something like &ldquo;list my newest leads&rdquo; and approve
        the tool call.
      </p>

      <h2 id="claude-ai">4b. Connect claude.ai or the Claude apps</h2>
      <ol>
        <li>
          In Claude, open <strong>Settings → Connectors</strong> and add a
          custom connector.
        </li>
        <li>
          Enter <code>https://mcp.example.com/mcp</code> as the URL and press{' '}
          <strong>Connect</strong>.
        </li>
        <li>
          A sign-in page from your server opens. Enter{' '}
          <code>OAUTH_PASSWORD</code> (or <code>MCP_BEARER_TOKEN</code> if you
          did not set one). Access lasts 30 days and refreshes automatically.
        </li>
      </ol>

      <h2 id="approvals">5. Decide what needs approval</h2>
      <p>
        Every tool acts with the MCP server&rsquo;s service credential, so a
        connected client can do what an admin can through those tools. Most
        clients can ask before each call; keep that on for anything that
        changes state:
      </p>
      <div className="table-wrap">
        <table>
          <thead>
            <tr>
              <th scope="col">Kind</th>
              <th scope="col">Tools</th>
            </tr>
          </thead>
          <tbody>
            <tr>
              <td>Sends messages</td>
              <td>
                <code>send_whatsapp</code>, <code>send_email</code>,{' '}
                <code>start_campaign</code>
              </td>
            </tr>
            <tr>
              <td>Deletes</td>
              <td>
                <code>delete_lead</code>, <code>delete_campaign</code>,{' '}
                <code>bulk_lead_action</code>
              </td>
            </tr>
            <tr>
              <td>Controls sending</td>
              <td>
                <code>system_pause_resume</code>, <code>pause_campaign</code>,{' '}
                <code>lead_toggle_pause</code>
              </td>
            </tr>
            <tr>
              <td>Read only</td>
              <td>
                <code>list_leads</code>, <code>get_lead</code>,{' '}
                <code>lead_timeline</code>, <code>list_messages</code>, analytics
                and status tools
              </td>
            </tr>
          </tbody>
        </table>
      </div>

      <h2 id="security">Keeping it safe</h2>
      <ul>
        <li>Only expose the MCP server over HTTPS, and only if you use a remote client.</li>
        <li>
          Rotate <code>MCP_BEARER_TOKEN</code> if it leaks; restart the MCP
          container to apply it.
        </li>
        <li>
          Results of each tool call go to the model you are using. Connect only
          clients whose data handling you accept for your leads.
        </li>
      </ul>
    </DocsShell>
  )
}
