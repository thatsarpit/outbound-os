import Link from 'next/link'
import { ArrowRight } from 'lucide-react'
import { AgentExchange } from '@/components/visuals/agent-exchange'
import { Breadcrumbs, Code, Faq, InstallBand, Related } from '@/components/content'
import { buildMetadata } from '@/lib/metadata'
import { LogoPair } from '@/components/logo-pair'
import { mcpToolCount, mcpToolGroups } from '@/lib/mcp-tools'

export const metadata = buildMetadata(
  'CRM MCP server — connect Claude to your leads',
  'Outbound OS ships an open-source MCP server: Claude and other MCP clients can search leads, import lists, run campaigns and read analytics on your live CRM.',
  '/mcp',
)

const toolGroups = mcpToolGroups
const toolCount = mcpToolCount

const faq = [
  {
    q: 'What is an MCP server?',
    a: 'MCP (Model Context Protocol) is an open standard that lets AI assistants call tools in other software. The Outbound OS MCP server gives Claude and other MCP clients a defined set of CRM tools instead of a pasted export.',
  },
  {
    q: 'Which AI clients work with it?',
    a: 'Any client that supports remote MCP servers over Streamable HTTP. Claude Code connects with a bearer token; claude.ai and the Claude apps connect as a custom connector through OAuth.',
  },
  {
    q: 'Can the AI send messages on its own?',
    a: 'Only if you let it. send_whatsapp, send_email and start_campaign are real actions. Keep your client set to ask before running write tools, and check the recipients before approving.',
  },
  {
    q: 'Does my CRM data go to the AI provider?',
    a: 'The results of the tools the assistant calls are sent to the model you are using, as with anything you show an assistant. Nothing is sent until a tool is called, and only what that tool returns.',
  },
]

/**
 * MCP deserves a product page because it is an operating surface, not a small
 * integration badge. The page distinguishes read, draft and action workflows
 * and states plainly where a tool can change real CRM state.
 */
export default function McpPage() {
  return (
    <>
      <section className="section section--lead hero-ground">
        <div className="page">
          <Breadcrumbs trail={[{ name: 'MCP server', path: '/mcp' }]} />
        </div>
        <div className="page split mcp-hero">
          <div className="section-head">
            <LogoPair brands={['outboundos', 'mcp', 'claude']} />
            <p className="eyebrow">MCP server for AI agents</p>
            <h1>Let Claude work your CRM, with a tool for every job.</h1>
            <p className="lede">
              Outbound OS ships an open-source MCP server with {toolCount}{' '}
              tools. Claude and other MCP clients can find leads, read
              timelines, import a list, build and start campaigns and pull
              analytics from your live data — without exporting anything first.
            </p>
            <div className="mcp-hero__actions">
              <Link href="/docs/mcp" className="btn btn--primary btn--lg">
                Set up the MCP server
              </Link>
              <a href="#examples" className="cta-link">
                See concrete workflows
                <ArrowRight size={15} />
              </a>
            </div>
          </div>

          <aside className="panel mcp-surface" aria-label="MCP capability summary">
            <div className="mcp-surface__head">
              <span className="badge badge--live"><span className="badge__dot" />Available now</span>
              <span className="mono">Outbound OS MCP</span>
            </div>
            <dl>
              <div><dt>Read</dt><dd>Leads, messages, timelines, campaigns and analytics</dd></div>
              <div><dt>Prepare</dt><dd>Reply suggestions and campaigns that remain in draft</dd></div>
              <div><dt>Act</dt><dd>Assign leads, update status, send and control campaigns</dd></div>
              <div><dt>Inspect</dt><dd>Connected sender health and automated sending state</dd></div>
            </dl>
          </aside>
        </div>
      </section>

      {/* One exchange does more than the capability list above it. "Your
          assistant can query the CRM" reads as either obvious or fantastical
          until you see the question, the tool it reaches for, and the rows
          that come back. */}
      <section className="section section--ruled">
        <div className="page split split--even mcp-demo">
          <div className="section-head">
            <p className="eyebrow">What it looks like</p>
            <h2>Ask in words. It reads your actual data.</h2>
            <p>
              The assistant is not guessing from a summary you pasted in. It
              calls the same API the dashboard uses, against the live
              workspace, through the MCP server&rsquo;s own service
              credential &mdash; so treat a connection like an admin login.
            </p>
            <p>
              Campaigns are created as drafts, and your client can ask before
              every tool that sends or deletes.
            </p>
          </div>
          <AgentExchange />
        </div>
      </section>

      <section id="examples" className="section section--ruled mcp-anchor">
        <div className="page split">
          <div className="section-head split__sticky">
            <p className="eyebrow">What it unlocks</p>
            <h2>Natural-language requests, grounded in current records.</h2>
            <p>
              The useful part is not chatting about a CRM. It is letting the
              client call explicit tools against the workspace and show what it
              used.
            </p>
          </div>

          <div className="stack mcp-workflows">
            <article>
              <p className="mcp-prompt">“Which open deals went quiet this week?”</p>
              <h3>Review the pipeline from live activity.</h3>
              <p>
                The client can list relevant leads, open their timelines and
                compare current status with recent activity. The answer comes
                from CRM records rather than a spreadsheet copied yesterday.
              </p>
              <code>list_leads · get_lead · lead_timeline</code>
            </article>
            <article>
              <p className="mcp-prompt">“Import these trade-show contacts and draft a follow-up.”</p>
              <h3>Prepare the work without pretending it was approved.</h3>
              <p>
                The client can import the list with the same merging rules as a
                CSV upload, preview who a campaign would reach and create it as
                a draft. A person reviews the recipients and template before
                starting it.
              </p>
              <code>import_leads · campaign_preview_leads · create_campaign</code>
            </article>
            <article>
              <p className="mcp-prompt">“Pause automated sending and show me sender health.”</p>
              <h3>Use operational controls during a real incident.</h3>
              <p>
                An approved client can stop the automated queue, inspect
                WhatsApp sender readiness and see the current system state. That
                is a real write operation, not a recommendation in chat.
              </p>
              <code>system_pause_resume · whatsapp_accounts · system_status</code>
            </article>
          </div>
        </div>
      </section>

      <section className="section section--ruled section--raised">
        <div className="page">
          <div className="section-head">
            <p className="eyebrow">Tool coverage</p>
            <h2>The same operating model, exposed as explicit tools.</h2>
          </div>

          <div className="mcp-tool-register status-ledger">
            <article>
              <div><h3>Leads</h3><span className="badge">Read and write</span></div>
              <p>List, search, inspect, create, update, assign, change status and work with lead timelines.</p>
            </article>
            <article>
              <div><h3>Messages</h3><span className="badge">Read and write</span></div>
              <p>Read WhatsApp and email history, request a suggested reply and send through connected accounts.</p>
            </article>
            <article>
              <div><h3>Campaigns</h3><span className="badge">Read and write</span></div>
              <p>Create and edit drafts, preview matching leads, start or pause campaigns and inspect results.</p>
            </article>
            <article>
              <div><h3>Analytics</h3><span className="badge">Read</span></div>
              <p>Pull current overview, funnel, campaign and email-performance data held by the product.</p>
            </article>
            <article>
              <div><h3>System</h3><span className="badge">Read and control</span></div>
              <p>Inspect sending and account state, list team members, and pause or resume automated sending.</p>
            </article>
          </div>
        </div>
      </section>

      <section className="section section--ruled">
        <div className="page">
          <div className="section-head">
            <p className="eyebrow">All {toolCount} tools</p>
            <h2>Every tool the server exposes.</h2>
            <p>Names as your client will show them.</p>
          </div>
          <div className="grid grid--3 mcp-tools">
            {toolGroups.map((group) => (
              <div key={group.name}>
                <h3>{group.name}</h3>
                <ul>
                  {group.tools.map((tool) => (
                    <li key={tool}>
                      <code>{tool}</code>
                    </li>
                  ))}
                </ul>
              </div>
            ))}
          </div>
        </div>
      </section>

      <section className="section section--ruled">
        <div className="page split">
          <div className="section-head">
            <p className="eyebrow">Set up</p>
            <h2>Two settings, one command, one client.</h2>
            <p>
              The MCP server is a second container that talks to your
              Outbound OS API. It stays off until you start it.
            </p>
            <Link href="/docs/mcp" className="cta-link">
              Full MCP setup guide
              <ArrowRight size={15} />
            </Link>
          </div>
          <div className="stack">
            <Code label=".env — generate each with: openssl rand -hex 32">{'MCP_SERVICE_TOKEN=<random>\nMCP_BEARER_TOKEN=<random>'}</Code>
            <Code label="Start it">{'docker compose --profile mcp up -d'}</Code>
            <Code label="Connect Claude Code">
              {'claude mcp add --transport http outbound-os \\\n  https://mcp.your-host.com/mcp \\\n  --header "Authorization: Bearer <MCP_BEARER_TOKEN>"'}
            </Code>
          </div>
        </div>
      </section>

      <section className="section section--ruled">
        <div className="page split">
          <div className="section-head">
            <p className="eyebrow">Where the line is</p>
            <h2>It is a tool interface, not an autonomous salesperson.</h2>
          </div>
          <div className="stack mcp-limits">
            <article><h3>It does not know facts you have not stored</h3><p>Price, scope, terms and relationship context still need a reliable source in the CRM or an explicit person in the loop.</p></article>
            <article><h3>It does not make sending harmless</h3><p>Some tools send immediately or change campaign state. Client approval settings and credential control matter.</p></article>
            <article><h3>It does not bypass WhatsApp or email policy</h3><p>The same provider rules apply whether a person clicked the action or an approved MCP client called the tool.</p></article>
          </div>
        </div>
      </section>

      <Faq items={faq} heading="MCP questions" />

      <Related
        links={[
          { href: '/docs/mcp', title: 'MCP setup guide', body: 'Tokens, HTTPS, Claude Code and claude.ai connectors.' },
          { href: '/integrations/csv-import', title: 'Importing leads', body: 'The merging rules import_leads follows.' },
          { href: '/capabilities', title: 'Capabilities', body: 'What the tools act on: inbox, sequences, campaigns, pipeline.' },
        ]}
      />

      <InstallBand />
    </>
  )
}
