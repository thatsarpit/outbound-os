import { brands, brandTitle, Logo, LogoTile, type BrandName } from '../brand-logo'

/**
 * The tools a lead comes in through and goes out on, as one quiet row of real
 * marks with their names. It stands still: this is a fact to scan, not a show.
 */
const ROW: BrandName[] = [
  'whatsapp',
  'gmail',
  'indiamart',
  'facebook',
  'telegram',
  'imessage',
  'zapier',
  'claude',
]

export function LogoRow({ caption }: { caption: string }) {
  return (
    <div className="logo-row">
      <p className="logo-row__caption">{caption}</p>
      <ul className="logo-row__list">
        {ROW.map((brand) => (
          <li key={brand}>
            {/* An app icon (iMessage) is a white glyph that needs its own tile. */}
            {brands[brand].kind === 'app' ? <LogoTile brand={brand} size={22} /> : <Logo brand={brand} size={20} />}
            <span>{brandTitle(brand)}</span>
          </li>
        ))}
      </ul>
    </div>
  )
}
