import Link from 'next/link'
import { Breadcrumbs } from '@/components/content'
import { DocsNav } from '@/components/docs-shell'
import { buildMetadata } from '@/lib/metadata'
import { docs, docSections } from '@/lib/docs'
import { integrations } from '@/lib/integrations'
import { site } from '@/lib/site-content'

export const metadata = buildMetadata(
  'Documentation — install, WhatsApp setup, webhooks, MCP',
  'Outbound OS documentation: install with Docker, connect the WhatsApp Cloud API, send leads from forms and webhooks, set up the MCP server, back up and upgrade.',
  '/docs',
)

export default function DocsIndex() {
  return (
    <section className="section section--lead">
      <div className="page docs-layout">
        <DocsNav />
        <div>
          <Breadcrumbs trail={[{ name: 'Docs', path: '/docs' }]} />
          <h1 className="docs-title">Outbound OS documentation</h1>
          <p className="lede docs-lede">
            Everything needed to install, connect and run a self-hosted
            Outbound OS. New here? Start with the install guide — it takes
            about five minutes.
          </p>

          <div className="docs-index">
            {docSections.map((section) => (
              <div key={section}>
                <h2>{section}</h2>
                <div className="grid grid--2">
                  {docs
                    .filter((doc) => doc.section === section)
                    .map((doc) => (
                      <Link key={doc.slug} href={`/docs/${doc.slug}`} className="dir-card">
                        <h3>{doc.title}</h3>
                        <p>{doc.description}</p>
                      </Link>
                    ))}
                </div>
              </div>
            ))}

            <div>
              <h2>Integration guides</h2>
              <div className="grid grid--3">
                {integrations.map((item) => (
                  <Link key={item.slug} href={`/integrations/${item.slug}`} className="dir-card">
                    <h3>{item.name}</h3>
                    <p>{item.summary}</p>
                  </Link>
                ))}
              </div>
            </div>

            <div className="docs-help">
              <h2>Stuck?</h2>
              <p>
                Ask in <a href={site.discussionsUrl}>GitHub Discussions</a>, or
                open an <a href={`${site.githubUrl}/issues`}>issue</a> if
                something is broken. Security problems go to{' '}
                <a href={`${site.githubUrl}/security/advisories/new`}>private vulnerability reporting</a>,
                never a public issue.
              </p>
            </div>
          </div>
        </div>
      </div>
    </section>
  )
}
