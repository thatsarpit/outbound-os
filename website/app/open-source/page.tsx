import Link from 'next/link'
import { ArrowRight } from 'lucide-react'
import { Breadcrumbs, Code, Faq, InstallBand, Related } from '@/components/content'
import { buildMetadata } from '@/lib/metadata'
import { LogoPair } from '@/components/logo-pair'
import { site } from '@/lib/site-content'

export const metadata = buildMetadata(
  'Open source — AGPL-3.0 WhatsApp CRM on GitHub',
  'Outbound OS is open source under AGPL-3.0: use it commercially, self-host it, change it. The stack, the license in plain words, and how to contribute.',
  '/open-source',
)

const faq = [
  {
    q: 'Can I use Outbound OS commercially?',
    a: 'Yes. You can run it for your own business, for clients, and charge for services around it. AGPL-3.0 only asks that if you run a modified version as a network service, you make your changes available to its users under the same license.',
  },
  {
    q: 'Do I have to publish my changes?',
    a: 'Only if you modify the code and let others use that modified version over a network. Configuration, your data, your templates and anything that talks to Outbound OS over its API or webhooks are not changes to the code.',
  },
  {
    q: 'Is there a paid edition with more features?',
    a: 'No. Every feature is in the open-source release. The maintainers offer managed hosting for teams that would rather not run a server, and that is the same software.',
  },
  {
    q: 'How do I report a security issue?',
    a: 'Privately, through GitHub’s private vulnerability reporting on the repository — not a public issue. Reports are acknowledged within three working days.',
  },
]

export default function OpenSourcePage() {
  return (
    <>
      <section className="section section--lead hero-ground">
        <div className="page landing-hero">
          <Breadcrumbs trail={[{ name: 'Open source', path: '/open-source' }]} />
          <LogoPair brands={['outboundos', 'github']} />
          <p className="eyebrow">Open source · {site.license}</p>
          <h1>Free to run, free to read, free to change.</h1>
          <p className="lede">
            Every line of Outbound OS is on GitHub under the {site.license}{' '}
            license — the API, the dashboard, the MCP server and this website.
            There is no closed &ldquo;enterprise&rdquo; edition waiting behind
            a sales call.
          </p>
          <div className="hero__actions">
            <a href={site.githubUrl} className="btn btn--primary btn--lg">
              Star on GitHub
            </a>
            <a href={site.discussionsUrl} className="cta-link">
              Join the discussion
              <ArrowRight size={15} aria-hidden="true" />
            </a>
          </div>
        </div>
      </section>

      <section className="section section--ruled">
        <div className="page split">
          <div className="section-head">
            <p className="eyebrow">The license, plainly</p>
            <h2>What {site.license} means for you.</h2>
            <a href={site.licenseUrl} className="cta-link">
              Read the full license
              <ArrowRight size={15} aria-hidden="true" />
            </a>
          </div>
          <div className="points">
            <div>
              <h3>You can</h3>
              <p>
                Use it for any purpose, including commercially. Self-host it for
                your team or your clients. Read, modify and fork the code.
              </p>
            </div>
            <div>
              <h3>You must</h3>
              <p>
                Keep the license and copyright notices. If you run a modified
                version as a service for others, offer them its source under
                the same license.
              </p>
            </div>
            <div>
              <h3>Why AGPL</h3>
              <p>
                It keeps improvements to a hosted Outbound OS flowing back to
                everyone who uses it, instead of into a closed fork.
              </p>
            </div>
          </div>
        </div>
      </section>

      <section className="section section--ruled section--raised">
        <div className="page split">
          <div className="section-head">
            <p className="eyebrow">The stack</p>
            <h2>Boring technology, on purpose.</h2>
            <p>
              Chosen so one person can run it and a newcomer can read it in an
              afternoon.
            </p>
          </div>
          <div className="points">
            <div>
              <h3>API and schedulers</h3>
              <p>Node.js 24 and Express, with Prisma over SQLite.</p>
            </div>
            <div>
              <h3>Dashboard</h3>
              <p>React and Vite, served by the same container.</p>
            </div>
            <div>
              <h3>MCP server</h3>
              <p>The official MCP TypeScript SDK over Streamable HTTP, with OAuth for claude.ai.</p>
            </div>
            <div>
              <h3>Packaging</h3>
              <p>Docker Compose with a named data volume, and CI that boots the image from scratch on every change.</p>
            </div>
          </div>
        </div>
      </section>

      <section className="section section--ruled">
        <div className="page split">
          <div className="section-head">
            <p className="eyebrow">Contribute</p>
            <h2>Contributions welcome.</h2>
            <p>
              Keep changes scoped and explain the why. New lead sources and
              channels follow a short checklist: keep provider ids, make
              repeated deliveries idempotent, stop automation on reply, and make
              failures visible.
            </p>
            <a href={`${site.githubUrl}/blob/main/CONTRIBUTING.md`} className="cta-link">
              Contributing guide
              <ArrowRight size={15} aria-hidden="true" />
            </a>
          </div>
          <Code label="Run the checks CI runs">
            {`npm ci && npm ci --prefix web
npm test
npm run test:integration
npm run lint --prefix web
npm run build --prefix web`}
          </Code>
        </div>
      </section>

      <Faq items={faq} heading="Open-source questions" />

      <Related
        links={[
          { href: '/self-hosted-crm', title: 'Self-hosting', body: 'What runs where, and what it takes to keep it running.' },
          { href: '/roadmap', title: 'Roadmap', body: 'What is available, in development and planned.' },
          { href: '/security', title: 'Security', body: 'How credentials, access and disclosure are handled.' },
        ]}
      />

      <InstallBand />
    </>
  )
}
