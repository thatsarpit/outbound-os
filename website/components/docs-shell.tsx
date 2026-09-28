import Link from 'next/link'
import type { ReactNode } from 'react'
import { ArrowLeft, ArrowRight } from 'lucide-react'
import { Breadcrumbs } from './content'
import { JsonLd } from './json-ld'
import { buildMetadata } from '@/lib/metadata'
import { docBySlug, docs, docSections } from '@/lib/docs'
import { contentUpdated, site } from '@/lib/site-content'
import { articleLd, graph } from '@/lib/structured-data'

/** Metadata for a docs page, from the registry, so title and description
    can never drift between the page, the index and the sitemap. */
export function docMetadata(slug: string) {
  const doc = docBySlug(slug)
  if (!doc) throw new Error(`Unknown doc: ${slug}`)
  return buildMetadata(doc.title, doc.description, `/docs/${slug}`, { type: 'article' })
}

function DocsNav({ current }: { current?: string }) {
  return (
    <nav className="docs-nav" aria-label="Documentation">
      {docSections.map((section) => (
        <div key={section} className="docs-nav__group">
          <h2>{section}</h2>
          <ul>
            {docs
              .filter((doc) => doc.section === section)
              .map((doc) => (
                <li key={doc.slug}>
                  <Link href={`/docs/${doc.slug}`} aria-current={doc.slug === current ? 'page' : undefined}>
                    {doc.label}
                  </Link>
                </li>
              ))}
          </ul>
        </div>
      ))}
    </nav>
  )
}

export function DocsShell({ slug, children }: { slug: string; children: ReactNode }) {
  const doc = docBySlug(slug)
  if (!doc) throw new Error(`Unknown doc: ${slug}`)
  const index = docs.indexOf(doc)
  const prev = docs[index - 1]
  const next = docs[index + 1]
  const path = `/docs/${slug}`

  return (
    <section className="section section--lead">
      <div className="page docs-layout">
        <DocsNav current={slug} />
        <article>
          <Breadcrumbs
            trail={[
              { name: 'Docs', path: '/docs' },
              { name: doc.label, path },
            ]}
          />
          <h1 className="docs-title">{doc.title}</h1>
          <p className="doc-meta">
            Updated {new Date(`${contentUpdated}T00:00:00Z`).toLocaleDateString('en-GB', { day: 'numeric', month: 'long', year: 'numeric', timeZone: 'UTC' })}{' '}
            · For version {site.version} ·{' '}
            <a href={`${site.githubUrl}/blob/main/website/app/docs/${slug}/page.tsx`}>Edit on GitHub</a>
          </p>
          <div className="prose docs-prose">{children}</div>

          <nav className="docs-pager" aria-label="Previous and next guide">
            {prev ? (
              <Link href={`/docs/${prev.slug}`} className="docs-pager__link">
                <span>
                  <ArrowLeft size={13} aria-hidden="true" /> Previous
                </span>
                {prev.label}
              </Link>
            ) : (
              <span />
            )}
            {next && (
              <Link href={`/docs/${next.slug}`} className="docs-pager__link docs-pager__link--next">
                <span>
                  Next <ArrowRight size={13} aria-hidden="true" />
                </span>
                {next.label}
              </Link>
            )}
          </nav>
        </article>
      </div>
      <JsonLd
        data={graph(
          articleLd({ title: doc.title, description: doc.description, path, dateModified: contentUpdated }),
        )}
      />
    </section>
  )
}

export { DocsNav }
