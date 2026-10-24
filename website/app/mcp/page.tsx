import Link from 'next/link'
import {
  ArrowRight,
  Check,
  CircleCheck,
  Eye,
  Fingerprint,
  MessageSquare,
  ShieldCheck,
  Terminal,
} from 'lucide-react'
import { Breadcrumbs, Code, Faq, Related } from '@/components/content'
import { Logo } from '@/components/brand-logo'
import { buildMetadata } from '@/lib/metadata'
import { mcpToolCount, mcpToolGroups } from '@/lib/mcp-tools'

export const metadata = buildMetadata(
  'CRM MCP server — connect your AI client to Outbound OS',
  'Connect an MCP-compatible AI client to Outbound OS. Search leads, read conversations, prepare campaigns and inspect CRM data with explicit tools.',
  '/mcp',
)

const faq = [
  {
    q: 'What does the MCP connection add?',
    a: 'It gives a compatible AI client tools that read or change records in your Outbound OS installation. The assistant requests a tool, the server calls the CRM API, and the result returns to your client. It is not a separate copy of the CRM.',
  },
  {
    q: 'Can I connect ChatGPT, Codex or Claude?',
    a: 'Use a client that supports a remote Streamable HTTP MCP server and your configured authentication mode. Client editions and workspace policies can restrict custom servers. The setup guide explains the server endpoint, bearer-token connection and OAuth flow; check your client’s current requirements.',
  },
  {
    q: 'Can an AI client send messages?',
    a: 'The server includes send and campaign-control tools, which can change real data or send through your connected accounts. Authentication is not approval for an individual send. Configure your client to ask before write actions and review the recipient, sender and content.',
  },
  {
    q: 'Is my dashboard role automatically the MCP role?',
    a: 'Do not assume it is. The service-credential connection uses the server’s configured CRM access, rather than inheriting your dashboard session. Your administrator must choose and secure the authentication mode. Treat a shared service credential as privileged.',
  },
  {
    q: 'What reaches the AI provider?',
    a: 'Tool results are returned to the AI client and can become context for its model. Connect only a client and provider you trust with the data it requests. Keep service tokens out of prompts, public pages and source control.',
  },
]

const readPrompt =
  'Use Outbound OS to list the first 3 contacted leads, sorted by lastMessageAt ascending. Show their names, status and last activity. Read only; do not send messages or change any records.'

export default function McpPage() {
  return (
    <>
      <section className="section section--lead hero-ground">
        <div className="page">
          <Breadcrumbs trail={[{ name: 'MCP server', path: '/mcp' }]} />
          <div className="mcp-hero">
            <div className="mcp-hero__copy">
              <div className="mcp-wordmark">
                <Logo brand="mcp" size={26} />
                <span>Model Context Protocol</span>
              </div>
              <p className="eyebrow">Your CRM, in your AI workflow</p>
              <h1>
                Ask your CRM.
                <br />
                Work from the answer.
              </h1>
              <p className="lede">
                Find a lead, read the conversation, prepare the next step. Connect your AI client to{' '}
                {mcpToolCount} explicit tools in your own Outbound OS installation.
              </p>
              <div className="mcp-hero__actions">
                <Link href="/docs/mcp" className="btn btn--primary btn--lg">
                  Connect your AI client <ArrowRight size={16} aria-hidden="true" />
                </Link>
                <a href="#mcp-tools" className="cta-link">
                  Browse the tools <ArrowRight size={15} aria-hidden="true" />
                </a>
              </div>
              <p className="mcp-hero__clients">
                ChatGPT · Codex · Claude · compatible remote MCP clients
              </p>
            </div>
            <figure className="mcp-example">
              <figcaption>
                <span>
                  <Terminal size={15} aria-hidden="true" />
                  Outbound OS MCP
                </span>
                <span>Example · sample records</span>
              </figcaption>
              <div className="mcp-example__request">
                <span>You ask</span>
                <p>Which contacted leads have been quiet the longest?</p>
              </div>
              <div className="mcp-example__call">
                <div>
                  <Eye size={14} aria-hidden="true" />
                  <span>Read tool</span>
                  <code>list_leads</code>
                </div>
                <pre>
                  <code>
                    {
                      '{\n  "status": "contacted",\n  "sortBy": "lastMessageAt",\n  "sortOrder": "asc",\n  "limit": 3\n}'
                    }
                  </code>
                </pre>
              </div>
              <div className="mcp-example__result">
                <span>Returned records</span>
                <ul>
                  <li>
                    <strong>Meridian Distributors</strong>
                    <span>Contacted · 9 days ago</span>
                  </li>
                  <li>
                    <strong>Adler Handel</strong>
                    <span>Contacted · 8 days ago</span>
                  </li>
                  <li>
                    <strong>Northwind Supply</strong>
                    <span>Contacted · 6 days ago</span>
                  </li>
                </ul>
              </div>
              <div className="mcp-example__foot">
                <Check size={14} aria-hidden="true" />
                Read the records. No message sent.
              </div>
            </figure>
          </div>
        </div>
      </section>

      <section className="section section--ruled mcp-work-section">
        <div className="page">
          <div className="section-head">
            <p className="eyebrow">From context to next action</p>
            <h2>Three useful ways to put it to work.</h2>
          </div>
          <div className="mcp-jobs">
            <article>
              <span className="mcp-jobs__number">01 / Read</span>
              <h3>Get back into a conversation.</h3>
              <p>
                Find the lead, read message history and inspect the timeline before writing a reply.
              </p>
              <div>
                <code>list_leads</code>
                <code>list_messages</code>
                <code>lead_timeline</code>
              </div>
            </article>
            <article>
              <span className="mcp-jobs__number">02 / Prepare</span>
              <h3>Build a campaign to review.</h3>
              <p>
                Inspect the audience and create a draft. Starting the campaign is a separate action
                with real consequences.
              </p>
              <div>
                <code>campaign_preview_leads</code>
                <code>create_campaign</code>
              </div>
            </article>
            <article>
              <span className="mcp-jobs__number">03 / Inspect</span>
              <h3>Check the state of the system.</h3>
              <p>
                Read sender readiness and sending state. Investigate reported activity before
                deciding what to change.
              </p>
              <div>
                <code>whatsapp_accounts</code>
                <code>system_status</code>
              </div>
            </article>
          </div>
        </div>
      </section>

      <section className="section section--ruled">
        <div className="page split mcp-control">
          <div className="section-head">
            <p className="eyebrow">Know what you connect</p>
            <h2>Reading context and sending a message are different permissions.</h2>
            <p>
              The client proposes tools. Your installation controls access. Your client’s approval
              settings decide when it asks you to continue.
            </p>
            <Link href="/security" className="cta-link">
              Read the security model <ArrowRight size={15} aria-hidden="true" />
            </Link>
          </div>
          <div className="mcp-boundaries">
            <article>
              <Eye size={20} aria-hidden="true" />
              <div>
                <h3>A read returns CRM data.</h3>
                <p>
                  Leads, messages and analytics can become context for the model you use. Connect a
                  provider you trust with that information.
                </p>
              </div>
            </article>
            <article>
              <MessageSquare size={20} aria-hidden="true" />
              <div>
                <h3>A write changes the workspace.</h3>
                <p>
                  Send tools and campaign controls are live operations. Review recipients, content
                  and sender before approving. Provider acceptance does not prove delivery.
                </p>
              </div>
            </article>
            <article>
              <ShieldCheck size={20} aria-hidden="true" />
              <div>
                <h3>Provider rules still apply.</h3>
                <p>
                  The WhatsApp service window, approved templates, opt-outs and account limits apply
                  to tool calls just as they do in the dashboard.
                </p>
              </div>
            </article>
          </div>
        </div>
      </section>

      <section className="section section--ruled" id="mcp-connect">
        <div className="page split mcp-connect">
          <div className="section-head">
            <p className="eyebrow">Make the connection</p>
            <h2>Start with one read. Verify the whole path.</h2>
            <p>
              The optional MCP container connects to your CRM API. Give it an HTTPS endpoint,
              configure authentication, then add that endpoint in your AI client.
            </p>
            <Link href="/docs/mcp" className="cta-link">
              Server & client setup guide <ArrowRight size={15} aria-hidden="true" />
            </Link>
          </div>
          <div>
            <ol className="mcp-connect__steps">
              <li>
                <span>01</span>
                <div>
                  <h3>Run the MCP service.</h3>
                  <p>Start the Docker MCP profile with separate service and client credentials.</p>
                </div>
              </li>
              <li>
                <span>02</span>
                <div>
                  <h3>Add your server to the client.</h3>
                  <p>
                    Use your own HTTPS URL ending in <code>/mcp</code>. Authenticate with the mode
                    your administrator configured.
                  </p>
                </div>
              </li>
              <li>
                <span>03</span>
                <div>
                  <h3>Run a read-only request.</h3>
                  <p>
                    A returned tool result verifies more than a successful health check. Do this
                    before approving any write.
                  </p>
                </div>
              </li>
            </ol>
            <Code label="Your first read-only request">{readPrompt}</Code>
            <p className="mcp-credential-note">
              <Fingerprint size={16} aria-hidden="true" />
              The server URL is not a credential. Keep tokens in the client’s credential
              configuration, never in a prompt.
            </p>
          </div>
        </div>
      </section>

      <section className="section section--ruled mcp-register-section" id="mcp-tools">
        <div className="page">
          <details className="mcp-register">
            <summary>
              <div>
                <p className="eyebrow">Tool reference</p>
                <h2>All {mcpToolCount} tools, by job.</h2>
                <p>Exact names exposed by the server. Read and write tools share this catalogue.</p>
              </div>
              <span className="mcp-register__toggle">
                Browse tools <ArrowRight size={17} aria-hidden="true" />
              </span>
            </summary>
            <div className="mcp-tools">
              {mcpToolGroups.map((group) => (
                <section key={group.name}>
                  <h3>
                    {group.name}
                    <span>{group.tools.length}</span>
                  </h3>
                  <ul>
                    {group.tools.map((tool) => (
                      <li key={tool}>
                        <code>{tool}</code>
                      </li>
                    ))}
                  </ul>
                </section>
              ))}
            </div>
          </details>
          <p className="mcp-register-note">
            <CircleCheck size={15} aria-hidden="true" />
            The website’s tool catalogue is checked against the MCP server in CI.
          </p>
        </div>
      </section>
      <Faq items={faq} heading="Connecting your AI client" />
      <Related
        heading="Set up with confidence"
        links={[
          {
            href: '/docs/mcp',
            title: 'MCP connection guide',
            body: 'Service setup, client credentials, HTTPS and OAuth.',
          },
          {
            href: '/integrations',
            title: 'Connect your channels',
            body: 'The accounts and data routes your tools operate on.',
          },
          {
            href: '/security',
            title: 'Security & ownership',
            body: 'Access, credentials and your responsibility as the operator.',
          },
        ]}
      />
      <section className="section section--ruled">
        <div className="page mcp-close">
          <div>
            <p className="eyebrow">Keep the CRM where you run it</p>
            <h2>Your workspace. Another way to work.</h2>
            <p>
              Run Outbound OS on your infrastructure, connect the channels you need, and add the MCP
              service when you are ready.
            </p>
          </div>
          <Link href="/docs/install" className="btn btn--primary btn--lg">
            Run Outbound OS <ArrowRight size={16} aria-hidden="true" />
          </Link>
        </div>
      </section>
    </>
  )
}
