import { ImageResponse } from 'next/og'
import { site } from '@/lib/site-content'
import { brandForImage, type BrandName } from './brand-logo'

const MARK =
  'M11 3H21A8 8 0 0 1 29 11V21A8 8 0 0 1 21 29H11A8 8 0 0 1 3 21V11A8 8 0 0 1 11 3ZM13 9.5H22.5V19H19.5V14.6L12.1 22L10 19.9L17.4 12.5H13V9.5Z'

/** A logo tile Satori can draw: full-colour marks on white as an SVG data
    image, app icons and lettered marks on their own colour. */
function Tile({ brand, size }: { brand: BrandName; size: number }) {
  const b = brandForImage(brand)
  const inner = Math.round(size * 0.58)
  const solid = b.kind === 'app' || b.kind === 'mono' || b.kind === 'icon' || b.kind === 'self'
  const ground = b.kind === 'app' || b.kind === 'mono' || b.kind === 'icon' ? b.hex : b.kind === 'self' ? '#0b0d10' : '#ffffff'
  return (
    <div
      style={{
        width: size,
        height: size,
        borderRadius: Math.round(size * 0.26),
        background: ground,
        border: solid ? 'none' : '1px solid rgb(228 228 234)',
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        color: '#fff',
        fontSize: Math.round(size * 0.36),
        fontWeight: 700,
      }}
    >
      {b.kind === 'color' && (
        <img
          width={inner}
          height={inner}
          alt=""
          style={{ objectFit: 'contain' }}
          src={`data:image/svg+xml;utf8,${encodeURIComponent(
            `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ${b.w} ${b.h}">${b.body}</svg>`,
          )}`}
        />
      )}
      {(b.kind === 'glyph' || b.kind === 'app') && (
        <svg viewBox="0 0 24 24" width={inner} height={inner}>
          <path d={b.path} fill={b.kind === 'glyph' ? b.hex : '#fff'} />
        </svg>
      )}
      {b.kind === 'self' && (
        <svg viewBox="0 0 32 32" width={inner} height={inner}>
          <path fillRule="evenodd" clipRule="evenodd" fill="#fff" d={MARK} />
        </svg>
      )}
      {b.kind === 'mono' && b.letters}
      {b.kind === 'icon' && b.title.slice(0, 1)}
    </div>
  )
}

const DEFAULT_LOGOS: BrandName[] = ['whatsapp', 'gmail', 'telegram', 'imessage', 'indiamart', 'claude']

export const socialImageSize = { width: 1200, height: 630 }

/** A flat brand card shared by Open Graph and X, one per page. No decorative
 * gradient: the mark, the page's own headline and the product line carry it. */
export async function createSocialCard({
  eyebrow = 'Open-source WhatsApp CRM',
  headline = 'Answer every lead in seconds. Follow up until they reply.',
  logos = DEFAULT_LOGOS,
}: { eyebrow?: string; headline?: string; logos?: BrandName[] } = {}) {
  const size = headline.length > 60 ? 58 : headline.length > 34 ? 66 : 78
  return new ImageResponse(
    (
      <div
        style={{
          width: '100%',
          height: '100%',
          display: 'flex',
          flexDirection: 'column',
          justifyContent: 'space-between',
          padding: '72px 78px',
          background:
            'radial-gradient(circle at 88% 12%, rgba(34,197,94,0.22), rgba(250,250,251,0) 45%), radial-gradient(circle at 8% 100%, rgba(44,63,224,0.10), rgba(250,250,251,0) 40%), rgb(250 250 251)',
          color: 'rgb(23 23 28)',
          fontFamily: 'Inter, Arial, sans-serif',
          border: '1px solid rgb(228 228 234)',
        }}
      >
        <div style={{ display: 'flex', alignItems: 'center', gap: 20 }}>
          <div
            style={{
              width: 64,
              height: 64,
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              color: 'rgb(250 250 251)',
            }}
          >
            <svg viewBox="0 0 32 32" width="64" height="64">
              <path
                fillRule="evenodd"
                clipRule="evenodd"
                fill="rgb(23 23 28)"
                d="M11 3H21A8 8 0 0 1 29 11V21A8 8 0 0 1 21 29H11A8 8 0 0 1 3 21V11A8 8 0 0 1 11 3ZM13 9.5H22.5V19H19.5V14.6L12.1 22L10 19.9L17.4 12.5H13V9.5Z"
              />
            </svg>
          </div>
          <div style={{ display: 'flex', fontSize: 38, fontWeight: 600, letterSpacing: '-0.03em' }}>
            {site.name}
          </div>
        </div>

        <div style={{ display: 'flex', flexDirection: 'column', gap: 22 }}>
          <div
            style={{
              display: 'flex',
              fontSize: 24,
              fontWeight: 600,
              color: 'rgb(22 128 72)',
              letterSpacing: '0.01em',
            }}
          >
            {eyebrow}
          </div>
          <div
            style={{
              display: 'flex',
              maxWidth: 1000,
              fontSize: size,
              lineHeight: 1.06,
              fontWeight: 600,
              letterSpacing: '-0.04em',
            }}
          >
            {headline}
          </div>
        </div>

        <div
          style={{
            display: 'flex',
            justifyContent: 'space-between',
            alignItems: 'center',
            paddingTop: 22,
            borderTop: '1px solid rgb(228 228 234)',
            fontSize: 19,
            color: 'rgb(133 133 143)',
          }}
        >
          <span>outboundos.space · Free · Open source</span>
          <div style={{ display: 'flex', gap: 12 }}>
            {logos.map((brand) => (
              <Tile key={brand} brand={brand} size={logos.length > 3 ? 46 : 58} />
            ))}
          </div>
        </div>
      </div>
    ),
    socialImageSize,
  )
}
