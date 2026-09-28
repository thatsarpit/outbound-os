import { Breadcrumbs, InstallBand } from '@/components/content'
import { buildMetadata } from '@/lib/metadata'
import { site } from '@/lib/site-content'
import { StatusTimeline } from '@/components/visuals/status-timeline'

export const metadata = buildMetadata(
  'Roadmap — what ships today and what is next',
  'The Outbound OS roadmap: what is in the open-source release today, what is being built, and what is planned. Suggest features in GitHub Discussions.',
  '/roadmap',
)

/**
 * Roadmap states are deliberately repetitive. Every capability carries its
 * own status so a plan can never be mistaken for a feature in the release.
 */
export default function RoadmapPage() {
  return (
    <>
      <section className="section section--lead hero-ground">
        <div className="page">
          <div className="roadmap-hero section-head">
            <Breadcrumbs trail={[{ name: 'Roadmap', path: '/roadmap' }]} />
            <p className="eyebrow">Roadmap</p>
            <h1>What ships today. What is being built. What is a plan.</h1>
            <p className="lede">
              Everything under &ldquo;available now&rdquo; is in the
              open-source release on GitHub, version {site.version}. Nothing
              below it should be assumed until it ships.
            </p>
            <p className="roadmap-hero__note">
              No dates are promised. Want something moved up? Say so in{' '}
              <a className="link" href={site.discussionsUrl}>GitHub Discussions</a> — or build it.
            </p>
          </div>
        </div>
      </section>

      <section className="section section--tight section--ruled">
        <div className="page">
          <StatusTimeline
            groups={[
              {
                phase: 'now',
                items: [
                  { title: 'CRM, ownership and pipeline', detail: 'Records, owners, status, notes, tasks, scoring.' },
                  { title: 'WhatsApp', detail: 'Meta Cloud API or AiSensy, per number.' },
                  { title: 'Email, Telegram, iMessage', detail: 'SMTP/IMAP, Brevo, your Telegram account, BlueBubbles.' },
                  { title: 'Lead capture', detail: 'Forms, ads, marketplaces, Zapier, CSV — with instant first contact.' },
                  { title: 'Campaigns and follow-ups', detail: 'Sequences that stop when a buyer replies.' },
                  { title: 'Orders and customers', detail: 'Orders, invoices, shipments, products, revenue.' },
                  { title: 'MCP server', detail: 'Claude and other AI clients on live data.' },
                ],
              },
              {
                phase: 'building',
                items: [
                  { title: 'Alerts and notification routing', detail: 'Clearer alerts, routed back to the affected conversation.' },
                ],
              },
              {
                phase: 'planned',
                items: [
                  { title: 'Quotations', detail: 'Quotes that turn into orders and invoices.' },
                  { title: 'Support threads', detail: 'Post-sale conversations with owner and status.' },
                  { title: 'Multiple workspaces', detail: 'Separate teams or clients in one install.' },
                ],
              },
            ]}
          />
        </div>
      </section>

      <section className="section section--ruled">
        <div className="page split roadmap-section">
          <div className="section-head split__sticky">
            <span className="badge badge--live"><span className="badge__dot" />Available now</span>
            <h2>In the open-source release.</h2>
            <p>Each of these is described in the docs and runs from a single Docker install.</p>
          </div>
          <div className="status-ledger roadmap-list">
            <article><h3>CRM records, ownership and pipeline</h3><p>Lead records with owner, status, HOT/WARM/COLD tier, notes, tasks and a full activity timeline. Roles for admins, managers, agents and viewers, and lead pools to limit visibility.</p></article>
            <article><h3>Channels</h3><p>WhatsApp through Meta&rsquo;s Cloud API or AiSensy; email over SMTP/IMAP or Brevo; Telegram from your own account; iMessage through BlueBubbles. All threads on the same lead.</p></article>
            <article><h3>Lead capture and first contact</h3><p>Webhooks with presets for website forms, Facebook Lead Ads, IndiaMART, TradeIndia, JustDial and Engyne Cloud; CSV import and export. Live leads are contacted within seconds.</p></article>
            <article><h3>Campaigns and follow-ups</h3><p>Targeted campaigns with approved templates, follow-up sequences timed to the lead&rsquo;s morning, and replies that stop them.</p></article>
            <article><h3>Orders and customers</h3><p>Customers, products, orders, invoices and shipments, WhatsApp order updates, and revenue and margin in your home currency.</p></article>
            <article><h3>Integrations out</h3><p>Signed outgoing webhooks, a live Google Sheets sync, and an MCP server for AI clients.</p></article>
            <article><h3>Operations</h3><p>Setup wizard, built-in sign-in or Clerk, encrypted credentials, automatic migrations, backups, and an Android companion app.</p></article>
          </div>
        </div>
      </section>

      <section className="section section--ruled section--raised">
        <div className="page split split--reverse roadmap-section">
          <div className="status-ledger roadmap-list">
            <article>
              <h3>Richer alerts and notification routing</h3>
              <p>
                More useful intervention alerts, routed back to the affected
                conversation, and better visibility when a channel or scheduled
                action needs attention.
              </p>
            </article>
          </div>
          <div className="section-head">
            <span className="badge badge--development"><span className="badge__dot" />In development</span>
            <h2>Active work, not yet a promise.</h2>
            <p>Implementation has started, but the finished behaviour can still change.</p>
          </div>
        </div>
      </section>

      <section className="section section--ruled">
        <div className="page split roadmap-section">
          <div className="section-head split__sticky">
            <span className="badge badge--planned">Planned</span>
            <h2>Direction, not features.</h2>
            <p>Do not choose Outbound OS today because of anything in this list.</p>
          </div>
          <div className="status-ledger roadmap-list">
            <article><h3>Quotations</h3><p>Create, revise and send quotations that become orders and invoices without re-typing.</p></article>
            <article><h3>Support threads</h3><p>Post-sale conversations with their own owner and status, on the same customer history.</p></article>
            <article><h3>Multiple workspaces</h3><p>Separate teams, brands or clients inside one install, each with its own leads and channels.</p></article>
          </div>
        </div>
      </section>

      <InstallBand heading="Use what ships today." />
    </>
  )
}
