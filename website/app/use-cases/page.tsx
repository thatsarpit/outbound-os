import Link from 'next/link'
import { Briefcase, Truck, Wrench } from 'lucide-react'
import { Breadcrumbs, InstallBand, Screenshot } from '@/components/content'
import { buildMetadata } from '@/lib/metadata'

export const metadata = buildMetadata(
  'Use cases — exporters, distributors, agencies, services',
  'How exporters, distributors, manufacturers, agencies and service businesses use Outbound OS to answer every enquiry fast and follow up on every quote.',
  '/use-cases',
)

/** Use cases are organised by recognizable customer work, not generic
 * personas. Pharma export keeps a dedicated, specific section as the first
 * proven vertical workflow without defining the market for the whole product. */
export default function UseCasesPage() {
  return (
    <>
      <section className="section section--lead">
        <div className="page">
          <div className="section-head use-cases-lead">
            <Breadcrumbs trail={[{ name: 'Use cases', path: '/use-cases' }]} />
            <p className="eyebrow">Use cases</p>
            <h1>Start with the conversation your team keeps losing.</h1>
            <p className="lede">
              The industries differ. The operating failure is familiar: an
              enquiry arrives on one channel, context moves to another, and the
              next action becomes nobody&rsquo;s visible responsibility.
            </p>
            <nav className="use-cases-jump" aria-label="Use case sections">
              <a className="link" href="#agencies">Agencies</a>
              <a className="link" href="#distribution">Distribution &amp; manufacturing</a>
              <a className="link" href="#services">Services</a>
              <a className="link" href="#pharma-export">Pharma export</a>
            </nav>
          </div>
        </div>
      </section>

      <section className="section section--ruled">
        <div className="page split">
          <div className="section-head">
            <p className="eyebrow">Across businesses</p>
            <h2>The same CRM, shaped around different buying conversations.</h2>
            <p>Outbound OS fits where customer contact is frequent, multichannel and valuable enough that follow-through needs a system.</p>
          </div>
          <div className="stack use-cases-industries">
            <article id="agencies" className="use-case-anchor">
              <span className="use-case__icon"><Briefcase size={15} strokeWidth={1.9} aria-hidden="true" /></span>
              <p className="eyebrow">Agencies &amp; professional services</p>
              <h3>Keep new-business work attached to the proposal.</h3>
              <p>Route website, email and WhatsApp enquiries; assign the right lead; and keep follow-up visible after scope, audit or pricing is sent.</p>
            </article>
            <article id="distribution" className="use-case-anchor">
              <span className="use-case__icon"><Truck size={15} strokeWidth={1.9} aria-hidden="true" /></span>
              <p className="eyebrow">Distributors, manufacturers &amp; exporters</p>
              <h3>Move a product enquiry through quote and repeat order.</h3>
              <p>Keep requested products, channel history, territory ownership and the next commercial step together across sales teams.</p>
            </article>
            <article id="services" className="use-case-anchor">
              <span className="use-case__icon"><Wrench size={15} strokeWidth={1.9} aria-hidden="true" /></span>
              <p className="eyebrow">Service businesses</p>
              <h3>Give high-volume enquiries one queue and one owner.</h3>
              <p>Useful for real estate, education, healthcare and other teams where a shared number receives more customer conversations than one person can reliably remember.</p>
            </article>
          </div>
        </div>
      </section>

      <section className="section section--tight section--ruled section--raised">
        <div className="page">
          <div className="section-head">
            <p className="eyebrow">Common workflow</p>
            <h2>What happens after the first response.</h2>
            <p>The operating value is ownership and a reliable stop condition, not simply sending a message faster.</p>
          </div>
        </div>
      </section>

      <section className="section section--ruled">
        <div className="page split">
          <div className="section-head split__sticky">
            <p className="eyebrow">Inbound enquiry to owned deal</p>
            <h2>Turn contact into a visible next action.</h2>
          </div>
          <ol className="stack use-case-flow">
            <li><p className="eyebrow">Arrives</p><h3>The enquiry enters from a connected source.</h3><p>WhatsApp, email, IndiaMART, CSV or a supported webhook creates the working context without requiring a rep to maintain a separate list.</p></li>
            <li><p className="eyebrow">Qualifies</p><h3>Priority and ownership become explicit.</h3><p>Scoring helps order attention. A person decides whether the request fits and takes responsibility for the next step.</p></li>
            <li><p className="eyebrow">Replies</p><h3>The answer starts from the actual conversation.</h3><p>First contact goes out automatically with an approved template. After that, the owner replies from the full thread and checks every commercial promise.</p></li>
            <li><p className="eyebrow">Moves</p><h3>Status and next action stay on the record.</h3><p>The manager sees what is being worked, what is waiting and where an enquiry needs someone else to decide.</p></li>
          </ol>
        </div>
      </section>

      <section className="section section--ruled section--raised">
        <div className="page split split--reverse">
          <div className="stack use-case-flow use-case-flow--compact">
            <article><p className="eyebrow">Team decision</p><h3>Choose the quote or proposal that still merits attention.</h3><p>The system does not decide that silence means interest. A person selects the record and approves the follow-up approach.</p></article>
            <article><p className="eyebrow">Campaign work</p><h3>Run the approved sequence through the right account.</h3><p>Messages follow configured business hours and sender limits across WhatsApp, email or both.</p></article>
            <article><p className="eyebrow">Stop condition</p><h3>Remove the customer as soon as they answer.</h3><p>A reply stops the sequence for that lead. The live conversation becomes the priority again.</p></article>
          </div>
          <div className="section-head">
            <p className="eyebrow">Quote and proposal follow-up</p>
            <h2>Consistent chasing that stops at the answer.</h2>
            <p>Changing the quote, scope or terms remains a human decision.</p>
          </div>
        </div>
      </section>

      <section className="section section--ruled">
        <div className="page">
          <div className="section-head">
            <p className="eyebrow">Manager intervention</p>
            <h2>Open the thread behind the stalled status.</h2>
            <p>A pipeline label is useful only when the manager can see what the customer asked, what the owner sent and where the work stopped.</p>
          </div>
          <div className="split use-case-manager">
            <div className="stack use-case-flow use-case-flow--compact">
              <article><p className="eyebrow">Inspect</p><h3>Read the customer history in context.</h3><p>Review the connected conversation, source, owner and current lead state without asking for a separate recap.</p></article>
              <article><p className="eyebrow">Decide</p><h3>Separate a commercial issue from a process gap.</h3><p>The record may need a different price, clearer scope, another owner or no further pursuit. The manager owns that judgement.</p></article>
              <article><p className="eyebrow">Act</p><h3>Move the record and make the next owner visible.</h3><p>Update status, assignment or the follow-up plan with the customer thread still attached.</p></article>
            </div>
            <Screenshot
              name="overview"
              alt="Outbound OS overview with the pipeline by stage and the leads that need attention"
            />
          </div>
        </div>
      </section>

      <section id="pharma-export" className="section section--ruled section--raised use-case-anchor">
        <div className="page split">
          <div className="section-head split__sticky">
            <span className="badge badge--live"><span className="badge__dot" />Proven use case</span>
            <p className="eyebrow use-case-proven__eyebrow">Pharma export</p>
            <h2>Specific enough to show where the system earns its keep.</h2>
            <p>
              Pharma export is a real operating pattern for Outbound OS: an
              IndiaMART enquiry, an overseas buyer, WhatsApp and email, product
              and quantity context, a quotation and disciplined follow-up.
            </p>
          </div>
          <div className="stack use-case-flow">
            <article><p className="eyebrow">Intake</p><h3>IndiaMART supplies the enquiry context.</h3><p>The buyer, product and country arrive through <Link className="link" href="/integrations/indiamart">IndiaMART&rsquo;s Lead Manager Push API</Link> the moment the enquiry is sent, and first contact goes out within seconds.</p></article>
            <article><p className="eyebrow">Response</p><h3>The team replies across the channel the buyer is using.</h3><p>WhatsApp uses the official business route; email uses the exporter&rsquo;s own mailbox. Market timezone, template approval and account limits remain part of setup.</p></article>
            <article><p className="eyebrow">Commercial boundary</p><h3>The exporter approves the promise.</h3><p>Product fit, MOQ, lead time, regulatory detail, price and payment terms are decided by people, never by automation.</p></article>
            <article><p className="eyebrow">Follow-through</p><h3>The quotation remains connected to the chase.</h3><p>Approved follow-up can run on schedule, and a reply stops the sequence so the rep works the active buyer conversation.</p></article>
          </div>
        </div>
      </section>

      <section className="section section--ruled">
        <div className="page split split--reverse">
          <div className="stack use-cases-limits">
            <article><h3>It does not qualify the customer for you</h3><p>Priority orders attention. It does not verify a business, a buyer or a purchase decision.</p></article>
            <article><h3>It does not decide your commercial position</h3><p>Price, scope, product fit, terms and whether to keep pursuing the deal remain with the business.</p></article>
            <article><h3>It does not make every industry identical</h3><p>Teams still configure stages, language, channels and hand-offs around the way their customers actually buy.</p></article>
          </div>
          <div className="section-head"><p className="eyebrow">Where the workflow stops</p><h2>The difficult decisions stay visible.</h2></div>
        </div>
      </section>

      <InstallBand />
    </>
  )
}
