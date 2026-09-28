import Link from 'next/link'
import { Breadcrumbs, InstallBand } from '@/components/content'
import { buildMetadata } from '@/lib/metadata'
import { alternatives } from '@/lib/alternatives'

export const metadata = buildMetadata(
  'Alternatives — Wati, AiSensy, Interakt, Formspree compared',
  'How Outbound OS, an open-source self-hosted WhatsApp CRM, compares with Wati, AiSensy, Interakt and Formspree — fairly, including when they are the better choice.',
  '/alternatives',
)

export default function AlternativesIndex() {
  return (
    <>
      <section className="section section--lead hero-ground">
        <div className="page landing-hero">
          <Breadcrumbs trail={[{ name: 'Alternatives', path: '/alternatives' }]} />
          <p className="eyebrow">Comparisons</p>
          <h1>How Outbound OS compares, stated fairly.</h1>
          <p className="lede">
            Most WhatsApp platforms are hosted services you rent. Outbound OS
            is open-source software you run. That one difference decides most
            of the rest — and each page below says plainly when the other
            product is the better fit.
          </p>
        </div>
      </section>

      <section className="section section--ruled">
        <div className="page">
          <div className="grid grid--2">
            {alternatives.map((alt) => (
              <Link key={alt.slug} href={`/alternatives/${alt.slug}`} className="dir-card">
                <span className="dir-card__kind">{alt.theyAre}</span>
                <h2 className="alt-card__title">Outbound OS vs {alt.name}</h2>
                <p>{alt.intro.split('. ')[0]}.</p>
              </Link>
            ))}
            <Link href="/form-backend" className="dir-card">
              <span className="dir-card__kind">Hosted form backend</span>
              <h2 className="alt-card__title">Outbound OS vs Formspree</h2>
              <p>A form backend that turns each submission into a lead and replies on WhatsApp.</p>
            </Link>
          </div>
        </div>
      </section>

      <InstallBand />
    </>
  )
}
