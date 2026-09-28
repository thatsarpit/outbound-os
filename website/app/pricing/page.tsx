import Link from 'next/link'
import { Breadcrumbs, Faq, InstallBand } from '@/components/content'
import { buildMetadata } from '@/lib/metadata'
import { site } from '@/lib/site-content'

export const metadata = buildMetadata(
  'Pricing — free and open source, or managed hosting',
  'Outbound OS is free: every feature, unlimited users and leads, self-hosted under AGPL-3.0. What you pay others (server, Meta) and what managed hosting covers.',
  '/pricing',
)

const faq = [
  {
    q: 'Is Outbound OS really free?',
    a: `Yes. The software is free under ${site.license} with every feature included — no user, lead, number or message limits set by us. You pay for your own server and for what your channel providers charge.`,
  },
  {
    q: 'What does WhatsApp cost?',
    a: 'Meta charges per message, by category and the recipient’s country, billed to your own WhatsApp Business account — templates, and from 1 October 2026 replies inside the 24-hour window too. Outbound OS adds nothing on top. If you send through AiSensy, their plan applies instead.',
  },
  {
    q: 'What server do I need?',
    a: 'Any machine with Docker. A small cloud server with 1–2 GB of memory handles a team. Most providers offer one for a few US dollars a month.',
  },
  {
    q: 'Can I use it commercially, or for clients?',
    a: 'Yes. The AGPL allows commercial use and hosting for clients. If you modify the code and offer that modified version to others over a network, you share those changes under the same license.',
  },
  {
    q: 'What does managed hosting include?',
    a: 'The maintainers set up and run an instance for you: server, HTTPS, backups, upgrades and help connecting WhatsApp and email. It is the same open-source software, and you can take your data and self-host at any time. Terms are agreed per team.',
  },
]

export default function PricingPage() {
  return (
    <>
      <section className="section section--lead hero-ground">
        <div className="page landing-hero">
          <Breadcrumbs trail={[{ name: 'Pricing', path: '/pricing' }]} />
          <p className="eyebrow">Pricing</p>
          <h1>Free. Every feature, every user, every lead.</h1>
          <p className="lede">
            Outbound OS is open-source software. There is no paid tier, no seat
            count and no feature held back. You run it on your own server — or
            ask us to run it for you.
          </p>
        </div>
      </section>

      <section className="section section--ruled">
        <div className="page">
          <div className="grid grid--2 price-options">
            <article>
              <p className="eyebrow">Self-hosted</p>
              <h2>Free</h2>
              <p className="price-options__lede">
                The full product under {site.license}, on a server you control.
              </p>
              <ul className="checks">
                <li>Unlimited users, leads, numbers and mailboxes</li>
                <li>WhatsApp, email, Telegram and iMessage</li>
                <li>Every lead source and integration</li>
                <li>Campaigns, sequences, pipeline and orders</li>
                <li>MCP server for AI agents</li>
                <li>Community help in GitHub Discussions</li>
              </ul>
              <div className="price-options__cta">
                <Link href="/docs/install" className="btn btn--primary btn--lg">
                  Install now
                </Link>
              </div>
            </article>
            <article>
              <p className="eyebrow">Managed hosting</p>
              <h2>Quoted per team</h2>
              <p className="price-options__lede">
                The same software, set up and run by the maintainers.
              </p>
              <ul className="checks">
                <li>Server, HTTPS, monitoring and nightly backups</li>
                <li>Upgrades applied for you</li>
                <li>Help connecting WhatsApp, email and lead sources</li>
                <li>Direct support from the people who build it</li>
                <li>Your data exportable at any time — no lock-in</li>
              </ul>
              <div className="price-options__cta">
                <Link href="/managed-hosting" className="btn btn--secondary btn--lg">
                  Ask about managed hosting
                </Link>
              </div>
            </article>
          </div>
        </div>
      </section>

      <section className="section section--ruled section--raised">
        <div className="page split">
          <div className="section-head">
            <p className="eyebrow">Paid to others</p>
            <h2>What you will pay someone else.</h2>
            <p>Outbound OS adds no margin to any of these.</p>
          </div>
          <div className="points">
            <div>
              <h3>A server</h3>
              <p>Any machine with Docker; 1–2 GB of memory is enough for a team.</p>
            </div>
            <div>
              <h3>WhatsApp messages</h3>
              <p>
                Billed by Meta to your own WhatsApp Business account, by
                category and the recipient&rsquo;s country — templates, and
                from 1 October 2026 service replies too.
              </p>
            </div>
            <div>
              <h3>Email sending</h3>
              <p>Your existing mailboxes, or a Brevo plan if you use Brevo.</p>
            </div>
          </div>
        </div>
      </section>

      <Faq items={faq} heading="Pricing questions" />

      <InstallBand />
    </>
  )
}
