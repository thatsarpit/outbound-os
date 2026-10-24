import fs from 'node:fs'
import path from 'node:path'
import { ImageResponse } from 'next/og'
import { site } from '@/lib/site-content'
import { brandForImage, type BrandName } from './brand-logo'

const MARK =
  'M11 3H21A8 8 0 0 1 29 11V21A8 8 0 0 1 21 29H11A8 8 0 0 1 3 21V11A8 8 0 0 1 11 3ZM13 9.5H22.5V19H19.5V14.6L12.1 22L10 19.9L17.4 12.5H13V9.5Z'

// Satori has no page stylesheets or inherited theme tokens. Keep its palette
// explicit, including data read from the shared DOM logo registry.
const palette = {
  background: '#0b0b0e',
  surface: '#141419',
  raised: '#1c1c22',
  border: '#383842',
  text: '#f7f7f9',
  secondary: '#a0a0ac',
  email: '#9575f7',
  success: '#4ade80',
  focus: '#8b99ff',
} as const

function imageColor(value: string) {
  const tokens: Record<string, string> = {
    'var(--email)': palette.email,
    'var(--success)': palette.success,
    'var(--focus)': palette.focus,
    currentColor: palette.text,
  }
  return tokens[value] ?? (/^#[0-9a-f]{3}(?:[0-9a-f]{3})?$/i.test(value) ? value : palette.text)
}

/** Actual provider marks on dark tiles. Monochrome SVG bodies inherit an
 * explicit colour inside their data URI, independently of the outer card. */
function Tile({ brand, size }: { brand: BrandName; size: number }) {
  const b = brandForImage(brand)
  const inner = Math.round(size * 0.58)
  const ground = b.kind === 'app' ? imageColor(b.hex) : palette.raised
  const ink = 'hex' in b ? imageColor(b.hex) : palette.text
  return (
    <div
      style={{
        width: size,
        height: size,
        borderRadius: Math.round(size * 0.23),
        backgroundColor: ground,
        border: `1px solid ${palette.border}`,
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        color: palette.text,
        fontSize: Math.round(size * 0.32),
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
            `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ${b.w} ${b.h}" fill="${palette.text}" color="${palette.text}">${b.body}</svg>`,
          )}`}
        />
      )}
      {(b.kind === 'glyph' || b.kind === 'app') && (
        <svg viewBox="0 0 24 24" width={inner} height={inner}>
          <path d={b.path} fill={b.kind === 'glyph' ? ink : palette.text} />
        </svg>
      )}
      {b.kind === 'self' && (
        <svg viewBox="0 0 32 32" width={inner} height={inner}>
          <path fillRule="evenodd" clipRule="evenodd" fill={palette.text} d={MARK} />
        </svg>
      )}
      {b.kind === 'image' && (
        <img width={Math.round(size * 0.7)} height={Math.round(size * 0.7)} alt="" src={publicDataUri(b.src)} />
      )}
      {b.kind === 'mono' && b.letters}
      {b.kind === 'icon' && (
        <svg viewBox="0 0 24 24" width={inner} height={inner} fill="none" stroke={ink} strokeWidth={1.8} strokeLinecap="round" strokeLinejoin="round">
          {brand === 'email' ? <><rect x="3" y="5" width="18" height="14" rx="2" /><path d="m3 7 9 6 9-6" /></>
            : brand === 'csv' ? <><path d="M5 3h10l4 4v14H5zM15 3v5h4M8 12h8M8 16h8M12 12v7" /></>
            : brand === 'webhooks' ? <><circle cx="6" cy="17" r="3" /><circle cx="18" cy="17" r="3" /><circle cx="12" cy="6" r="3" /><path d="m8 14 3-5m2 0 3 5M9 18h6" /></>
            : <><rect x="3" y="5" width="18" height="14" rx="3" /><circle cx="8" cy="12" r=".8" /><circle cx="12" cy="12" r=".8" /><circle cx="16" cy="12" r=".8" /></>}
        </svg>
      )}
    </div>
  )
}

/** Share cards render at build time, so an image logo is read from public/. */
function publicDataUri(src: string) {
  const file = fs.readFileSync(path.join(process.cwd(), 'public', src))
  return `data:image/png;base64,${file.toString('base64')}`
}

const DEFAULT_LOGOS: BrandName[] = ['whatsapp', 'gmail', 'telegram', 'imessage', 'webhooks', 'mcp']

export const socialImageSize = { width: 1200, height: 630 }

/** A flat brand card shared by Open Graph and X, one per page. No decorative
 * gradient: the mark, the page's own headline and the product line carry it. */
export async function createSocialCard({
  eyebrow = 'Open-source WhatsApp CRM',
  headline = 'Every conversation, one place to act.',
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
          backgroundColor: palette.background,
          color: palette.text,
          fontFamily: 'sans-serif',
          border: `1px solid ${palette.border}`,
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
              color: palette.text,
            }}
          >
            <svg viewBox="0 0 32 32" width="64" height="64">
              <path
                fillRule="evenodd"
                clipRule="evenodd"
                fill={palette.text}
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
              color: palette.secondary,
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
            borderTop: `1px solid ${palette.border}`,
            fontSize: 19,
            color: palette.secondary,
          }}
        >
          <span>outboundos.space · Open source · Self-hosted</span>
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
