import type { CSSProperties } from 'react'
import logoSet from '@iconify-json/logos/icons.json'
import { siBrevo, siGooglesheets, siImessage, siMake, siWebflow, type SimpleIcon } from 'simple-icons'
import { FileSpreadsheet, FormInput, Mail, Webhook, type LucideIcon } from 'lucide-react'
import { BrandMark } from './brand-mark'

/**
 * The real logos of the products Outbound OS works with.
 *
 * Full-colour marks come from Gil Barbara's "logos" set (CC0). Brands that set
 * does not carry use their official glyph from Simple Icons (CC0) in their own
 * colour — Google Sheets, Make, Brevo, Webflow — or, for iMessage, the app
 * icon's own green square. IndiaMART, AiSensy and TradeIndia use the site
 * icons they publish themselves (public/logos/). A brand with no square mark
 * of its own gets a lettered tile, never a hand-drawn imitation. Generic
 * ideas (email, webhooks, CSV) get an icon. Trademarks belong to their owners
 * and are used only to say what connects to what.
 */

type LogoSetIcon = { body: string; width?: number; height?: number }
const set = logoSet as unknown as { width?: number; height?: number; icons: Record<string, LogoSetIcon> }

type Brand =
  | { kind: 'color'; title: string; body: string; w: number; h: number }
  | { kind: 'glyph'; title: string; hex: string; path: string }
  | { kind: 'app'; title: string; hex: string; path: string }
  | { kind: 'mono'; title: string; hex: string; letters: string }
  | { kind: 'icon'; title: string; hex: string; Icon: LucideIcon }
  | { kind: 'self'; title: string }
  | { kind: 'image'; title: string; src: string }

function color(name: string, title: string): Brand {
  const icon = set.icons[name]
  if (!icon) throw new Error(`Logo not found: ${name}`)
  return { kind: 'color', title, body: icon.body, w: icon.width ?? set.width ?? 256, h: icon.height ?? set.height ?? 256 }
}
const glyph = (icon: SimpleIcon): Brand => ({ kind: 'glyph', title: icon.title, hex: `#${icon.hex}`, path: icon.path })

export const brands = {
  whatsapp: color('whatsapp-icon', 'WhatsApp'),
  meta: color('meta-icon', 'Meta'),
  facebook: color('facebook', 'Facebook'),
  telegram: color('telegram', 'Telegram'),
  gmail: color('google-gmail', 'Gmail'),
  zapier: color('zapier-icon', 'Zapier'),
  n8n: color('n8n-icon', 'n8n'),
  claude: color('claude-icon', 'Claude'),
  mcp: color('model-context-protocol-icon', 'Model Context Protocol'),
  docker: color('docker-icon', 'Docker'),
  github: color('github-icon', 'GitHub'),
  wordpress: color('wordpress-icon', 'WordPress'),
  framer: color('framer', 'Framer'),
  sheets: glyph(siGooglesheets),
  make: glyph(siMake),
  brevo: glyph(siBrevo),
  webflow: glyph(siWebflow),
  imessage: { kind: 'app', title: 'iMessage', hex: '#34DA50', path: siImessage.path },
  indiamart: { kind: 'image', title: 'IndiaMART', src: '/logos/indiamart.png' },
  aisensy: { kind: 'image', title: 'AiSensy', src: '/logos/aisensy.png' },
  tradeindia: { kind: 'image', title: 'TradeIndia', src: '/logos/tradeindia.png' },
  justdial: { kind: 'mono', title: 'JustDial', hex: '#c2410c', letters: 'JD' },
  engyne: { kind: 'mono', title: 'Engyne Cloud', hex: '#4338ca', letters: 'En' },
  email: { kind: 'icon', title: 'Email', hex: '#7c3aed', Icon: Mail },
  webhooks: { kind: 'icon', title: 'Webhooks', hex: '#17171c', Icon: Webhook },
  csv: { kind: 'icon', title: 'CSV', hex: '#15803d', Icon: FileSpreadsheet },
  forms: { kind: 'icon', title: 'Website forms', hex: '#2c3fe0', Icon: FormInput },
  outboundos: { kind: 'self', title: 'Outbound OS' },
} satisfies Record<string, Brand>

export type BrandName = keyof typeof brands

/** Which logo stands for each integration page. */
export const integrationBrand: Record<string, BrandName> = {
  'whatsapp-cloud-api': 'whatsapp',
  aisensy: 'aisensy',
  email: 'gmail',
  brevo: 'brevo',
  telegram: 'telegram',
  imessage: 'imessage',
  indiamart: 'indiamart',
  'facebook-lead-ads': 'facebook',
  zapier: 'zapier',
  'engyne-cloud': 'engyne',
  'google-sheets': 'sheets',
  webhooks: 'webhooks',
  'csv-import': 'csv',
  'website-forms': 'forms',
  mcp: 'claude',
}

/* Logo bodies carry gradient ids. The same logo can appear several times on a
   page — some copies hidden (marquee duplicates, inactive tabs) — and Chrome
   will not paint a gradient whose defining copy is display:none. Every
   rendering gets its own ids. */
let instance = 0
function uniqueIds(body: string) {
  const suffix = `-l${(instance += 1)}`
  return body.replace(/id="([^"]+)"/g, `id="$1${suffix}"`).replace(/url\(#([^)]+)\)/g, `url(#$1${suffix})`)
}

/** Just the mark, no tile. */
export function Logo({ brand, size = 24, className }: { brand: BrandName; size?: number; className?: string }) {
  const b: Brand = brands[brand]
  if (b.kind === 'color') {
    const scale = size / Math.max(b.w, b.h)
    return (
      <svg
        className={className}
        viewBox={`0 0 ${b.w} ${b.h}`}
        width={Math.round(b.w * scale)}
        height={Math.round(b.h * scale)}
        aria-hidden="true"
        dangerouslySetInnerHTML={{ __html: uniqueIds(b.body) }}
      />
    )
  }
  if (b.kind === 'glyph' || b.kind === 'app') {
    return (
      <svg className={className} viewBox="0 0 24 24" width={size} height={size} aria-hidden="true">
        <path d={b.path} fill={b.kind === 'glyph' ? b.hex : '#fff'} />
      </svg>
    )
  }
  if (b.kind === 'icon') return <b.Icon className={className} size={size} strokeWidth={2} color={b.hex} aria-hidden="true" />
  if (b.kind === 'image') {
    return <img className={className} src={b.src} width={size} height={size} alt="" decoding="async" loading="lazy" />
  }
  if (b.kind === 'self') return <BrandMark className={className} />
  return (
    <span className={className} style={{ fontSize: Math.round(size * 0.7), fontWeight: 700, color: '#fff' }} aria-hidden="true">
      {b.letters}
    </span>
  )
}

/**
 * The logo on an app-icon tile: white for full-colour marks, the brand's own
 * colour for app icons and lettered marks. `label` makes it a named image;
 * without it the text beside it carries the name.
 */
export function LogoTile({
  brand,
  size = 40,
  label,
  className,
}: {
  brand: BrandName
  size?: number
  label?: boolean
  className?: string
}) {
  const b: Brand = brands[brand]
  const solid = b.kind === 'app' || b.kind === 'mono' || b.kind === 'self'
  const ground = b.kind === 'app' || b.kind === 'mono' ? b.hex : b.kind === 'self' ? '#0b0d10' : '#ffffff'
  const style = { '--tile': ground, width: size, height: size } as CSSProperties
  const a11y = label ? { role: 'img', 'aria-label': b.title } : { 'aria-hidden': true as const }
  const inner = Math.round(size * (b.kind === 'color' ? 0.58 : b.kind === 'image' ? 0.7 : b.kind === 'self' ? 0.6 : 0.54))

  return (
    <span
      className={['logo-tile', solid ? 'logo-tile--solid' : '', className].filter(Boolean).join(' ')}
      style={style}
      {...a11y}
    >
      {b.kind === 'mono' ? (
        <span className="logo-tile__letters" style={{ fontSize: Math.round(size * 0.36) }}>
          {b.letters}
        </span>
      ) : b.kind === 'self' ? (
        <BrandMark className="logo-tile__self" />
      ) : (
        <Logo brand={brand} size={inner} />
      )}
    </span>
  )
}

export function brandTitle(brand: BrandName) {
  return brands[brand].title
}

/** Plain data for Satori (share images), which cannot run React components
    that set inner HTML. */
export function brandForImage(brand: BrandName) {
  return brands[brand] as Brand
}
