import Link from 'next/link'
import { Breadcrumbs, InstallBand } from '@/components/content'
import { buildMetadata } from '@/lib/metadata'
import { PipelineBoard } from '@/components/visuals/pipeline-board'

export const metadata = buildMetadata(
  'Features — WhatsApp CRM, campaigns, follow-ups, orders',
  'Every Outbound OS feature: lead capture, WhatsApp and email inbox, lead scoring, campaigns, follow-ups that stop on reply, orders and invoices, MCP, reporting and roles.',
  '/capabilities',
)

/** Capabilities is an operating reference. Sections are grouped by the job
 * being done, and every automation claim keeps its constraint nearby. */
export default function CapabilitiesPage() {
  return (
    <>
      <section className="section section--lead">
        <div className="page">
          <div className="section-head capabilities-lead">
            <Breadcrumbs trail={[{ name: 'Capabilities', path: '/capabilities' }]} />
            <p className="eyebrow">Capabilities</p>
            <h1>The working surface, grouped by responsibility.</h1>
            <p className="lede">
              Outbound OS covers the path from a new enquiry to an owned
              conversation, controlled follow-up and a pipeline a manager or an
              approved AI client can inspect.
            </p>
          </div>
        </div>
      </section>

      <section className="section section--tight section--ruled">
        <div className="page split capabilities-index-wrap">
          <div className="section-head"><p className="eyebrow">On this page</p><h2>Browse by operating responsibility.</h2></div>
          <nav className="panel capabilities-index" aria-label="Capability groups">
            <a href="#crm">CRM &amp; intake</a>
            <a href="#messaging">Inbox &amp; messaging</a>
            <a href="#qualification">Qualification &amp; ownership</a>
            <a href="#campaigns">Campaigns &amp; follow-up</a>
            <a href="#orders">Orders &amp; customers</a>
            <a href="#mcp">MCP &amp; developer access</a>
            <a href="#reporting">Reporting &amp; control</a>
          </nav>
        </div>
      </section>

      <section id="crm" className="section section--ruled capability-anchor">
        <div className="page split">
          <div className="section-head split__sticky">
            <p className="eyebrow">CRM &amp; intake</p>
            <h2>Start with one customer record, however the enquiry arrived.</h2>
            <p>The source stays attributable. The working status, owner, activity and conversation stay with the lead.</p>
          </div>
          <div className="stack capability-list">
            <article><h3>Lead records and pipeline</h3><p>Create and update leads, assign ownership, set sales status, add context and keep the record visible through the working pipeline.</p></article>
            <article><h3>Connected intake</h3><p>Website forms, Facebook Lead Ads, IndiaMART, TradeIndia, JustDial, Zapier and any other webhook, plus the conversations arriving on WhatsApp or email. Duplicates merge into the existing lead.</p></article>
            <article><h3>Instant first contact</h3><p>A lead from a live source gets your approved WhatsApp template and an email within seconds, on every channel you have connected.</p></article>
            <article><h3>CSV import and export</h3><p>Map a structured lead file into the workspace and export lead data when a team needs to move or review it elsewhere.</p></article>
            <article><h3>Activity timeline</h3><p>Keep messages, notes, tasks and record changes in chronological context instead of reconstructing the customer history from several apps.</p></article>
          </div>
        </div>
      </section>

      <section id="messaging" className="section section--ruled section--raised capability-anchor">
        <div className="page split split--reverse">
          <div className="stack capability-list">
            <article><h3>WhatsApp Business conversations</h3><p>Send and receive through Meta&rsquo;s WhatsApp Cloud API or AiSensy, chosen per number, with sent, delivered and read receipts. Template and provider rules remain in force.</p></article>
            <article><h3>Telegram and iMessage</h3><p>Message leads from your own Telegram account, or on iMessage through a Mac running BlueBubbles, in the same inbox.</p></article>
            <article><h3>Customer-owned email</h3><p>Send through SMTP and receive through IMAP using the business&rsquo;s own mailboxes, including replies within an existing thread.</p></article>
            <article><h3>Shared working context</h3><p>Keep channel history, lead status, assignment and follow-up state available to the people responsible for the customer.</p></article>
          </div>
          <div className="section-head">
            <p className="eyebrow">Inbox &amp; messaging</p>
            <h2>Work the conversation without losing the CRM state.</h2>
            <p>The inbox is not a second record. It is the customer history attached to the same lead the pipeline uses.</p>
          </div>
        </div>
      </section>

      <section id="qualification" className="section section--ruled capability-anchor">
        <div className="page split">
          <div className="section-head">
            <p className="eyebrow">Qualification &amp; ownership</p>
            <h2>Make priority and responsibility explicit.</h2>
            <p>Queue order helps a team decide what to inspect first. It does not turn a lead score into buyer intent.</p>
          </div>

          {/* Wrapped with the list so `.split` keeps two columns — a third
              grid child silently reflows the whole section. */}
          <div className="cap-column">
            {/* Ownership and stalled work are things a board makes obvious and
                a paragraph does not. Colour sits on the one card that needs
                intervention, which is what a manager opens this to find. */}
            <PipelineBoard className="cap-board" />

            <div className="stack capability-list capability-list--compact">
            <article><h3>HOT, WARM and COLD tiers</h3><p>Recency and engagement help order the queue using a deliberately small, readable vocabulary.</p></article>
            <article><h3>Lead assignment</h3><p>Give a record one responsible team member or move it when ownership changes.</p></article>
            <article><h3>Tags and working filters</h3><p>Segment leads by source, country, status, engagement and the tags the team uses to organise its own work.</p></article>
            <article><h3>Lead pools</h3><p>Control which records a team member can see without copying the underlying customer record.</p></article>
          </div>
          </div>
        </div>
      </section>

      <section id="campaigns" className="section section--ruled capability-anchor">
        <div className="page split split--reverse">
          <div className="stack capability-list">
            <article><h3>Draft and targeted campaigns</h3><p>Create campaigns against a defined lead filter, preview the matching audience and keep the campaign in draft until it is ready.</p></article>
            <article><h3>WhatsApp, email or both</h3><p>Use supported connected channels and the sender account chosen for the campaign rather than an Outbound OS-owned identity.</p></article>
            <article><h3>Reply-aware follow-up</h3><p>A buyer reply removes the lead from the active sequence so a scheduled chase does not land on top of a live response.</p></article>
            <article><h3>Pause and resume controls</h3><p>Stop a running campaign or the automated sending queue while preserving the work already completed.</p></article>
          </div>
          <div className="section-head">
            <p className="eyebrow">Campaigns &amp; follow-up</p>
            <h2>Consistency with a real stop condition.</h2>
            <p>The system can execute an approved plan. The team decides who should be contacted and what the message is allowed to promise.</p>
          </div>
        </div>
      </section>

      <section id="orders" className="section section--ruled section--raised capability-anchor">
        <div className="page split">
          <div className="section-head">
            <p className="eyebrow">Orders &amp; customers</p>
            <h2>After the reply: the order, the invoice, the shipment.</h2>
            <p>A won lead becomes a customer without leaving the record the conversation lives on.</p>
          </div>
          <div className="stack capability-list">
            <article><h3>Customers and products</h3><p>Convert a lead into a customer and keep a product catalogue to build orders from.</p></article>
            <article><h3>Orders, invoices and shipments</h3><p>Record order items, raise invoices and track shipments against each order.</p></article>
            <article><h3>Order updates on WhatsApp</h3><p>Send confirmed, shipped and delivered updates with your approved templates.</p></article>
            <article><h3>Revenue and margin</h3><p>Revenue, supplier costs and profit in your home currency.</p></article>
          </div>
        </div>
      </section>

      <section id="mcp" className="section section--ruled capability-anchor">
        <div className="page split">
          <div className="section-head split__sticky">
            <p className="eyebrow">MCP &amp; developer access</p>
            <h2>Operate the CRM from approved external tools.</h2>
            <p>The MCP server is an available product surface, not a planned integration.</p>
            <Link href="/mcp" className="cta-link">Read the MCP guide</Link>
          </div>
          <div className="stack capability-list">
            <article><h3>Lead and timeline tools</h3><p>Search and inspect leads, read activity, update status, assign ownership and perform explicit record actions.</p></article>
            <article><h3>Message and campaign tools</h3><p>Read channel history, import lists, create draft campaigns and—when approved in the client—send or change campaign state.</p></article>
            <article><h3>Analytics and system tools</h3><p>Pull current funnel or campaign data, inspect sender health and control the automated sending queue.</p></article>
            <article><h3>Webhooks and Google Sheets</h3><p>Signed events to any endpoint you control, and a live row in Google Sheets for each new lead and reply.</p></article>
          </div>
        </div>
      </section>

      <section id="reporting" className="section section--ruled capability-anchor">
        <div className="page split capabilities-controls">
          <section className="capability-group">
            <div className="capability-group__head"><p className="eyebrow">Reporting</p><h2>Activity with the record behind it.</h2></div>
            <div className="stack capability-list">
              <article><h3>Pipeline and funnel</h3><p>Review progression, source, tier and current working state, then inspect the conversations behind the summary.</p></article>
              <article><h3>Campaign and email performance</h3><p>Compare sent and reply activity held by the product without presenting a message as the verified cause of revenue.</p></article>
            </div>
          </section>
          <section className="capability-group">
            <div className="capability-group__head"><p className="eyebrow">Administration &amp; access</p><h2>Control who can work what.</h2></div>
            <div className="stack capability-list">
              <article><h3>Roles</h3><p>Admin, manager, agent and viewer roles separate setup, oversight, customer work and read-only visibility.</p></article>
              <article><h3>Connected-account health</h3><p>Inspect sending readiness, limits and product notifications when a channel or scheduled action needs attention.</p></article>
              <article><h3>Protected credentials</h3><p>Stored connection credentials are encrypted at rest with AES-256-GCM, with keys generated per install. See Security for details.</p></article>
            </div>
          </section>
        </div>
      </section>

      <InstallBand />
    </>
  )
}
