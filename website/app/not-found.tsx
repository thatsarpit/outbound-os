import Link from 'next/link'
import type { Metadata } from 'next'

export const metadata: Metadata = {
  title: 'Page not found',
  robots: { index: false, follow: true },
}

/** A dead end that offers the pages most people were looking for. */
export default function NotFound() {
  return (
    <section className="section section--lead">
      <div className="page page--prose not-found">
        <p className="eyebrow">404</p>
        <h1>That page is not here.</h1>
        <p className="lede">It may have moved when the site was reorganised. These are the usual destinations:</p>
        <ul className="checks">
          <li><Link className="link" href="/">Home</Link> — what Outbound OS is</li>
          <li><Link className="link" href="/docs/install">Install guide</Link> — running in five minutes</li>
          <li><Link className="link" href="/docs">Documentation</Link> — setup, WhatsApp, webhooks, MCP</li>
          <li><Link className="link" href="/integrations">Integrations</Link> — everything it connects to</li>
          <li><Link className="link" href="/pricing">Pricing</Link> — free, or managed hosting</li>
        </ul>
      </div>
    </section>
  )
}
