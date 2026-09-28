import { brandTitle, LogoTile, type BrandName } from '../brand-logo'

/**
 * A slow, continuous row of the tools Outbound OS works with. The list is
 * rendered twice so the loop is seamless; the copy is hidden from assistive
 * tech, and under reduced motion the row simply wraps and stands still.
 */
const ROW: BrandName[] = [
  'whatsapp',
  'meta',
  'gmail',
  'indiamart',
  'facebook',
  'telegram',
  'imessage',
  'brevo',
  'zapier',
  'make',
  'n8n',
  'sheets',
  'webflow',
  'wordpress',
  'framer',
  'claude',
  'aisensy',
  'docker',
]

export function LogoMarquee({ label = 'Works with' }: { label?: string }) {
  return (
    <div className="marquee" role="region" aria-label={`${label}: ${ROW.map(brandTitle).join(', ')}`}>
      <div className="marquee__track">
        {[0, 1].map((copy) => (
          <ul className="marquee__list" key={copy} aria-hidden="true">
            {ROW.map((brand) => (
              <li key={brand} className="marquee__item">
                <LogoTile brand={brand} size={34} />
                <span>{brandTitle(brand)}</span>
              </li>
            ))}
          </ul>
        ))}
      </div>
    </div>
  )
}
