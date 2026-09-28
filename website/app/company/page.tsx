import { Breadcrumbs, InstallBand } from '@/components/content'
import { buildMetadata } from '@/lib/metadata'
import { site } from '@/lib/site-content'

export const metadata = buildMetadata(
  'About — the team and ideas behind Outbound OS',
  'Outbound OS was built to run a real export sales desk and released as open source in 2026. Who builds it, who it is for, and the ideas it is built on.',
  '/company',
)

/** Unknown ownership and history facts stay as TODOs rather than becoming a
 * polished origin story. The page leads with what is true: product, market,
 * operating base and the product thesis. */
export default function CompanyPage() {
  return (
    <>
      <section className="section section--lead hero-ground">
        <div className="page company-hero">
          <div>
            <Breadcrumbs trail={[{ name: 'About', path: '/company' }]} />
            <p className="eyebrow">About</p>
            <h1>Built to run a real sales desk. Now open source.</h1>
            <p className="lede">
              Outbound OS started as the system behind a pharmaceutical export
              business answering buyers from IndiaMART, WhatsApp and email
              around the world. It worked, so we made it general and released
              it as open source under {site.license}.
            </p>
          </div>
          <dl className="company-coordinates panel">
            <div><dt>Based in</dt><dd>India</dd></div>
            <div><dt>Used</dt><dd>Worldwide</dd></div>
            <div><dt>Open source since</dt><dd>2026</dd></div>
            <div><dt>License</dt><dd>{site.license}</dd></div>
          </dl>
        </div>
      </section>

      <section className="section section--ruled">
        <div className="page split">
          <div className="section-head split__sticky">
            <p className="eyebrow">The product</p>
            <h2>One operating record across the channels already in use.</h2>
            <p>Outbound OS does not ask a business to abandon the identities its customers already know. It connects those accounts to consistent CRM work.</p>
          </div>
          <div className="company-product stack">
            <article><span className="eyebrow">Capture</span><h3>Bring the enquiry and source into view.</h3><p>Website forms, ads, IndiaMART, CSV and any webhook feed a customer record the team is able to own.</p></article>
            <article><span className="eyebrow">Work</span><h3>Connect qualification, conversation and next action.</h3><p>Scoring, assignment and pipeline status help the team decide and act without losing context between tools.</p></article>
            <article><span className="eyebrow">Follow through</span><h3>Run the approved sequence, then stop at the answer.</h3><p>Campaigns and follow-up respect connected accounts and configured limits. A customer reply returns the work to a live conversation.</p></article>
            <article><span className="eyebrow">Extend</span><h3>Let approved AI clients work through MCP.</h3><p>The MCP server exposes explicit lead, message, campaign, analytics and system tools instead of requiring a copied export.</p></article>
          </div>
        </div>
      </section>

      <section className="section section--tight section--raised section--ruled">
        <div className="page company-audience">
          <p className="eyebrow">Who it is for</p>
          <h2>Businesses where customer conversation is operating work.</h2>
          <p>
            Agencies, distributors, manufacturers, exporters, service
            businesses, real estate, education, healthcare and B2B sales teams
            all recognise the same gap: several channels, several owners and no
            reliable view of what should happen next.
          </p>
        </div>
      </section>

      <section className="section section--ruled">
        <div className="page split split--reverse">
          <div className="company-thesis stack">
            <article><h3>A shared inbox is not enough without ownership.</h3><p>The customer thread needs a status, a responsible person and a visible next action.</p></article>
            <article><h3>Automation should stop at the customer&rsquo;s answer.</h3><p>Follow-up is useful while a lead is quiet. Continuing a sequence over a live reply is a product failure.</p></article>
            <article><h3>AI access should expose real tools and real consequences.</h3><p>MCP makes the CRM available to approved clients, while sending and destructive actions remain explicit.</p></article>
            <article><h3>Direction should not be confused with availability.</h3><p>The roadmap separates what ships today from what is being built and what is only a plan.</p></article>
          </div>
          <div className="section-head"><p className="eyebrow">The thesis</p><h2>Make the routine work consistent. Keep judgement accountable.</h2></div>
        </div>

      </section>

      <InstallBand />
    </>
  )
}
