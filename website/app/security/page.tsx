import { Breadcrumbs } from '@/components/content'
import { buildMetadata } from '@/lib/metadata'
import { ControlsMatrix } from '@/components/visuals/controls-matrix'
import { site } from '@/lib/site-content'

export const metadata = buildMetadata(
  'Security — controls, disclosure and self-hosting duties',
  'How Outbound OS protects a self-hosted CRM: roles, encrypted credentials, generated keys, signed webhooks. What is not certified, and how to report a vulnerability.',
  '/security',
)

const advisoryUrl = `${site.githubUrl}/security/advisories/new`

/**
 * Security.
 *
 * A hard line between controls in the code, duties that fall on whoever runs
 * an install, and formal assurance that does not exist yet. The three kinds
 * of statement never share a badge.
 */
export default function SecurityPage() {
  return (
    <>
      <section className="section section--lead">
        <div className="page">
          <div className="security-hero">
            <Breadcrumbs trail={[{ name: 'Security', path: '/security' }]} />
            <p className="eyebrow">Security</p>
            <h1>What the code protects. What you protect. What is not certified.</h1>
            <p className="lede">
              Outbound OS handles contact data and the ability to message people
              in your name, so its defaults are strict. Because the code is
              open, every control on this page can be read and checked.
            </p>
          </div>
        </div>
      </section>

      <section className="section section--tight section--ruled">
        <div className="page">
          <div className="section-head">
            <p className="eyebrow">At a glance</p>
            <h2>What is in place, and what is not.</h2>
          </div>
          <ControlsMatrix />
        </div>
      </section>

      <section className="section section--ruled">
        <div className="page split">
          <div className="section-head split__sticky">
            <p className="eyebrow">In the code</p>
            <h2>Controls every install gets.</h2>
            <p>Product behaviour, not a compliance framework or a substitute for one.</p>
          </div>
          <dl className="security-ledger stack">
            <div>
              <dt>No default password</dt>
              <dd>
                The first admin gets the password you set, or a random one
                printed once. There is no built-in login that works on every
                install.
              </dd>
            </div>
            <div>
              <dt>Generated keys per install</dt>
              <dd>
                Session-signing and encryption keys are generated on first boot
                and stored beside the database, never shipped in the code.
              </dd>
            </div>
            <div>
              <dt>Encrypted credentials</dt>
              <dd>
                WhatsApp, email, iMessage and Telegram credentials are encrypted
                at rest with AES-256-GCM.
              </dd>
            </div>
            <div>
              <dt>Roles and lead pools</dt>
              <dd>
                Admin, manager, agent and viewer roles, checked on every API
                route; lead pools limit which records a user can see.
              </dd>
            </div>
            <div>
              <dt>Authenticated webhooks</dt>
              <dd>
                Lead sources need a per-source key, compared in constant time.
                Meta deliveries are signature-checked, and AiSensy, Brevo and
                iMessage webhooks are refused unless their secret is set.
              </dd>
            </div>
            <div>
              <dt>Rate-limited sign-in</dt>
              <dd>Repeated failed sign-ins and code requests are throttled.</dd>
            </div>
            <div>
              <dt>Activity log</dt>
              <dd>Who sent what, and when, tied to the person who acted.</dd>
            </div>
          </dl>
        </div>
      </section>

      <section className="section section--tight section--ruled">
        <div className="page">
          <div className="panel security-credentials">
            <div>
              <p className="eyebrow">Self-hosting</p>
              <h2>What falls to you.</h2>
            </div>
            <p>
              Running your own install means the server is yours to protect:
              put it behind HTTPS, keep the host and Docker updated, keep{' '}
              <code>.env</code> and backups private, rotate credentials when
              people leave, and follow the consent and record-keeping rules
              where you operate.
            </p>
          </div>
        </div>
      </section>

      <section className="section section--ruled">
        <div className="page">
          <div className="section-head">
            <p className="eyebrow">Formal assurance</p>
            <h2>What does not exist yet.</h2>
            <p>Stated directly, so a review does not have to ask.</p>
          </div>
          <div className="security-assurance stack">
            <div>
              <span className="badge badge--planned">Not available</span>
              <div>
                <h3>SOC 2 or ISO 27001</h3>
                <p>No certification is claimed and no audit has been carried out.</p>
              </div>
            </div>
            <div>
              <span className="badge badge--planned">Not available</span>
              <div>
                <h3>Third-party penetration test</h3>
                <p>No external penetration-test report exists to share.</p>
              </div>
            </div>
            <div>
              <span className="badge badge--planned">On request</span>
              <div>
                <h3>Data processing agreement</h3>
                <p>
                  Relevant only to managed hosting, where the maintainers
                  process data for you. Not yet a standard published document.
                </p>
              </div>
            </div>
          </div>
        </div>
      </section>

      <section className="section">
        <div className="page">
          <div className="band security-disclosure">
            <div>
              <h2>Report a vulnerability privately.</h2>
              <p>
                Use GitHub&rsquo;s private vulnerability reporting — never a
                public issue. Reports are acknowledged within three working
                days, with an assessment and fix timeline within ten.
              </p>
            </div>
            <a href={advisoryUrl} className="btn btn--primary btn--lg">
              Report on GitHub
            </a>
          </div>
        </div>
      </section>
    </>
  )
}
