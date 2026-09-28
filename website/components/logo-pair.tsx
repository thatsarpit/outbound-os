import { LogoTile, type BrandName } from './brand-logo'

/** Outbound OS joined to one or more other products by a live connector —
    the first thing an integration page shows. Decorative: the heading says it. */
export function LogoPair({ brands, size = 52 }: { brands: BrandName[]; size?: number }) {
  return (
    <div className="pair" aria-hidden="true">
      {brands.map((brand, index) => (
        <span key={brand} className="pair__item">
          {index > 0 && <span className="pair__link" />}
          <LogoTile brand={brand} size={size} />
        </span>
      ))}
    </div>
  )
}
