import Link from 'next/link'
import type { ReactNode } from 'react'
import { ArrowRight, CircleCheck } from 'lucide-react'
import { CopyButton } from './copy-button'
import { JsonLd } from './json-ld'
import { breadcrumbLd, faqLd, graph } from '@/lib/structured-data'
import { installCommands, site } from '@/lib/site-content'

/* ── Breadcrumbs ──────────────────────────────────────────────────────────
   Visible trail plus BreadcrumbList markup, so search results show the
   page's place in the site instead of a bare URL. */

export function Breadcrumbs({ trail }: { trail: ReadonlyArray<{ name: string; path: string }> }) {
  const full = [{ name: 'Home', path: '/' }, ...trail]
  return (
    <>
      <nav aria-label="Breadcrumb" className="crumbs">
        <ol>
          {full.map((crumb, index) => (
            <li key={crumb.path}>
              {index < full.length - 1 ? (
                <Link href={crumb.path}>{crumb.name}</Link>
              ) : (
                <span aria-current="page">{crumb.name}</span>
              )}
            </li>
          ))}
        </ol>
      </nav>
      <JsonLd data={graph(breadcrumbLd(full))} />
    </>
  )
}

/* ── FAQ ───────────────────────────────────────────────────────────────────
   Native <details>, so it works without JavaScript and every answer is in the
   HTML for crawlers. Emits FAQPage markup from the same array, so the markup
   can never drift from what the page shows. */

export type FaqItem = { q: string; a: string }

export function Faq({
  items,
  heading = 'Questions people ask',
  eyebrow = 'FAQ',
}: {
  items: ReadonlyArray<FaqItem>
  heading?: string
  eyebrow?: string
}) {
  return (
    <section className="section section--ruled" aria-labelledby="faq-heading">
      <div className="page split">
        <div className="section-head">
          <p className="eyebrow">{eyebrow}</p>
          <h2 id="faq-heading">{heading}</h2>
        </div>
        <div className="faq">
          {items.map((item) => (
            <details key={item.q}>
              <summary>
                <h3>{item.q}</h3>
              </summary>
              <p>{item.a}</p>
            </details>
          ))}
        </div>
      </div>
      <JsonLd data={graph(faqLd(items))} />
    </section>
  )
}

/* ── Code ─────────────────────────────────────────────────────────────── */

export function Code({ children, label }: { children: string; label?: string }) {
  return (
    <figure className="code">
      <div className="code__head">
        {label ? <figcaption className="code__label">{label}</figcaption> : <span />}
        <CopyButton text={children} className="copy-btn--quiet" />
      </div>
      <pre>
        <code>{children}</code>
      </pre>
    </figure>
  )
}

/* ── Install ──────────────────────────────────────────────────────────────
   The one call to action the whole site builds towards: it is running on
   your machine in four commands. */

export function InstallBand({
  heading = 'Running on your server in five minutes.',
  body = 'One Docker command starts the app, creates the database and your first admin. The setup wizard does the rest.',
}: {
  heading?: string
  body?: string
}) {
  return (
    <section className="section section--ruled">
      <div className="page">
        <div className="band install-band">
          <div className="install-band__copy">
            <h2>{heading}</h2>
            <p>{body}</p>
            <div className="hero__actions">
              <Link href="/docs/install" className="btn btn--secondary btn--lg">
                Read the install guide
              </Link>
              <a href={site.githubUrl} className="cta-link cta-link--inverse">
                View on GitHub
                <ArrowRight size={15} aria-hidden="true" />
              </a>
            </div>
          </div>
          <div className="terminal">
            <div className="terminal__bar">
              <span className="ui__dots" aria-hidden="true">
                <i />
                <i />
                <i />
              </span>
              <span className="terminal__title">Terminal</span>
              <CopyButton text={installCommands.join('\n')} className="copy-btn--night" />
            </div>
            <pre aria-label="Install commands">
              <code>
                {installCommands.map((line) => (
                  <span className="terminal__line" key={line}>
                    <span className="terminal__prompt" aria-hidden="true">
                      $
                    </span>
                    {line}
                  </span>
                ))}
              </code>
            </pre>
            <p className="terminal__done">
              <CircleCheck size={15} aria-hidden="true" />
              Open http://localhost:3001 and sign in
            </p>
          </div>
        </div>
      </div>
    </section>
  )
}

/* ── Screenshot ───────────────────────────────────────────────────────────
   Real product screenshots, taken from the dashboard's preview mode with
   made-up sample data. Width and height are set so the page never shifts
   while the image loads. The site is light-only, so the light captures are
   used everywhere. */

export function Screenshot({
  name,
  alt,
  priority = false,
  caption,
}: {
  name: 'overview' | 'inbox' | 'integrations' | 'setup' | 'whatsapp-settings'
  alt: string
  priority?: boolean
  caption?: ReactNode
}) {
  return (
    <figure className="screenshot">
      <img
        src={`/screenshots/${name}.webp`}
        srcSet={`/screenshots/${name}-800.webp 800w, /screenshots/${name}.webp 1600w`}
        sizes="(min-width: 1200px) 1120px, 100vw"
        alt={alt}
        width={1600}
        height={1000}
        loading={priority ? 'eager' : 'lazy'}
        fetchPriority={priority ? 'high' : 'auto'}
        decoding="async"
      />
      {caption && <figcaption>{caption}</figcaption>}
    </figure>
  )
}

/* ── Related links ────────────────────────────────────────────────────────
   Every page links onward to the pages a reader of it most likely needs
   next. Internal links are how search engines learn which pages matter. */

export function Related({
  links,
  heading = 'Keep reading',
}: {
  links: ReadonlyArray<{ href: string; title: string; body: string }>
  heading?: string
}) {
  return (
    <section className="section section--ruled" aria-labelledby="related-heading">
      <div className="page">
        <h2 id="related-heading" className="related__heading">
          {heading}
        </h2>
        <div className="grid grid--3 related">
          {links.map((link) => (
            <Link key={link.href} href={link.href} className="related__item">
              <h3>{link.title}</h3>
              <p>{link.body}</p>
              <span className="cta-link">
                Read more <ArrowRight size={14} aria-hidden="true" />
              </span>
            </Link>
          ))}
        </div>
      </div>
    </section>
  )
}
