import Link from 'next/link'
import { Breadcrumbs, InstallBand, Screenshot } from '@/components/content'
import { buildMetadata } from '@/lib/metadata'
import { ChannelFlow } from '@/components/visuals/channel-flow'

export const metadata = buildMetadata(
  'Platform — lead capture, shared inbox, follow-up, pipeline',
  'How Outbound OS works end to end: lead capture from any source, instant first contact, a shared WhatsApp and email inbox, follow-ups that stop on reply, and a pipeline.',
  '/platform',
)

/**
 * Platform follows the record from capture to close. Channel constraints and
 * the human approval line remain part of the machinery instead of being moved
 * to fine print at the bottom of the page.
 */
export default function PlatformPage() {
  return (
    <>
      <section className="section section--lead">
        <div className="page split platform-lead">
          <div className="section-head">
            <Breadcrumbs trail={[{ name: 'Platform', path: '/platform' }]} />
            <p className="eyebrow">The platform</p>
            <h1>One customer record. Every conversation and next action.</h1>
            <p className="lede">
              Outbound OS connects the places customers contact you with the
              CRM work that follows: qualification, ownership, replies,
              campaigns, pipeline and reporting.
            </p>
          </div>

          <aside className="panel platform-map" aria-label="Customer conversation loop">
            <p className="eyebrow">The working loop</p>
            <ol>
              <li><span>Capture</span><small>Connected sources</small></li>
              <li><span>Unify</span><small>One customer record</small></li>
              <li><span>Qualify</span><small>Priority and owner</small></li>
              <li><span>Reply</span><small>Context and approval</small></li>
              <li><span>Follow up</span><small>Until answered</small></li>
              <li><span>Track</span><small>Pipeline and activity</small></li>
            </ol>
          </aside>
        </div>
      </section>

      {/* Four sources, one queue — the product's central claim, and a shape,
          which is the one thing prose is worst at. Full width because the
          convergence is the message. */}
      <section className="section section--ruled">
        <div className="page">
          <div className="section-head">
            <p className="eyebrow">Intake</p>
            <h2>Everything lands in one queue.</h2>
            <p>
              Each channel keeps its own account and its own provider rules.
              What changes is that your team stops working four inboxes.
            </p>
          </div>
          <ChannelFlow className="platform-flow" />
        </div>
      </section>

      <section className="section section--ruled">
        <div className="page split">
          <div className="section-head split__sticky">
            <p className="eyebrow">End to end</p>
            <h2>The conversation becomes accountable work.</h2>
            <p>
              Automation advances repeatable steps. A person remains
              responsible for qualification, commercial promises and when a
              customer relationship should move or close.
            </p>
          </div>


          <ol className="stack platform-process">
            <li>
              <div className="platform-process__meta"><span className="eyebrow">Capture</span><span className="badge">System</span></div>
              <div><h3>Bring in the enquiry where it already arrives.</h3><p>WhatsApp, email, IndiaMART, CSV and supported webhooks feed the working lead record. The original channel remains the customer&rsquo;s account and keeps its own provider rules.</p></div>
            </li>
            <li>
              <div className="platform-process__meta"><span className="eyebrow">Unify</span><span className="badge">Shared record</span></div>
              <div><h3>Keep channel history with the same customer.</h3><p>The team works the customer record with message history, source, status and activity in view instead of reconciling a shared phone, an inbox and a spreadsheet.</p></div>
            </li>
            <li>
              <div className="platform-process__meta"><span className="eyebrow">Qualify</span><span className="badge">Shared</span></div>
              <div><h3>Use scoring to order attention, then assign an owner.</h3><p>Recency and engagement help surface the next record to inspect. The score does not verify intent or fit; a person qualifies the enquiry and owns the next action.</p></div>
            </li>
            <li>
              <div className="platform-process__meta"><span className="eyebrow">Reply</span><span className="badge">Human approval</span></div>
              <div><h3>Reply from the whole thread.</h3><p>Free text inside WhatsApp&rsquo;s 24-hour window, approved templates outside it, email from your own mailbox. Price, scope, timing and terms come from the person who owns the deal.</p></div>
            </li>
            <li>
              <div className="platform-process__meta"><span className="eyebrow">Follow up</span><span className="badge">System</span></div>
              <div><h3>Run the approved sequence until the customer answers.</h3><p>Campaigns work through connected sender accounts inside configured business hours and limits. A reply removes the lead from the sequence so the live thread takes priority.</p></div>
            </li>
            <li>
              <div className="platform-process__meta"><span className="eyebrow">Track</span><span className="badge">Shared record</span></div>
              <div><h3>Review the status with the conversation behind it.</h3><p>Pipeline, activity and reporting stay tied to the lead. Managers can inspect why a deal is stalled without asking someone to reconstruct the customer history first.</p></div>
            </li>
          </ol>
        </div>
      </section>

      <section className="section section--ruled section--raised">
        <div className="page">
          <div className="section-head">
            <p className="eyebrow">The approval line</p>
            <h2>Repeatable work for the system. Judgement for the team.</h2>
          </div>
          <div className="grid grid--2 platform-boundary">
            <article>
              <p className="eyebrow">Handled by Outbound OS</p>
              <h3>Operating consistency</h3>
              <ul>
                <li>Capturing records from connected sources.</li>
                <li>Ordering the queue and retaining channel history.</li>
                <li>Sending first contact the moment a lead arrives.</li>
                <li>Running approved campaigns inside configured limits.</li>
                <li>Stopping a sequence when the customer replies.</li>
              </ul>
            </article>
            <article>
              <p className="eyebrow">Owned by the business</p>
              <h3>Commercial responsibility</h3>
              <ul>
                <li>Deciding whether the enquiry is worth pursuing.</li>
                <li>Approving price, scope, terms and timing.</li>
                <li>Choosing who may use each sender account.</li>
                <li>Following consent and channel policy.</li>
                <li>Deciding when a deal should move or close.</li>
              </ul>
            </article>
          </div>
        </div>
      </section>

      <section className="section section--ruled">
        <div className="page split split--reverse platform-workspace">
          <Screenshot
            name="inbox"
            alt="Outbound OS inbox with a lead's WhatsApp and email conversation, status and owner"
          />
          <div className="flow-lg">
            <div className="section-head">
              <p className="eyebrow">One record, different responsibilities</p>
              <h2>The rep works the next action. The manager sees the gap.</h2>
            </div>
            <div className="stack platform-views">
              <article><h3>For the person handling the customer</h3><p>See the assigned queue, the complete thread, current status and the follow-up that needs attention.</p></article>
              <article><h3>For the manager</h3><p>Review work across the team, open the conversation behind a status and step into a stalled record with the same context the owner sees.</p></article>
            </div>
          </div>
        </div>
      </section>

      <section className="section section--ruled">
        <div className="page split">
          <div className="section-head">
            <p className="eyebrow">AI clients</p>
            <h2>The platform is available through MCP as well as the dashboard.</h2>
            <p>An approved MCP-capable client can work with the same leads, messages, campaigns, analytics and system controls.</p>
            <Link href="/mcp" className="cta-link">Explore MCP access</Link>
          </div>
          <div className="stack platform-constraints">
            <article><h3>Ask against current CRM data</h3><p>Inspect lead status and activity without copying the workspace into a separate prompt.</p></article>
            <article><h3>Prepare work in draft</h3><p>Import a list or create a draft campaign for a person to review before it starts.</p></article>
            <article><h3>Control real actions carefully</h3><p>Some tools can send, start campaigns or delete records. Credentials and client approval settings are part of the operating design.</p></article>
          </div>
        </div>
      </section>

      <section className="section section--ruled">
        <div className="page split">
          <div className="section-head">
            <p className="eyebrow">Channels and access</p>
            <h2>The account still makes the rules.</h2>
          </div>
          <div className="stack platform-constraints">
            <article><h3>WhatsApp stays on the official business route</h3><p>Meta template, consent and messaging rules continue to apply through the customer&rsquo;s WhatsApp Business setup.</p></article>
            <article><h3>Email stays in customer-owned mailboxes</h3><p>Connected SMTP and IMAP accounts preserve the business identity customers already know.</p></article>
            <article><h3>Roles and lead pools limit visibility</h3><p>Admin, manager, agent and viewer roles separate responsibility, while lead pools segment which records team members can see.</p></article>
          </div>
        </div>
      </section>

      <InstallBand />
    </>
  )
}
