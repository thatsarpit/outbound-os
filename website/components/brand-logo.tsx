import type { CSSProperties } from 'react'
import {
  siBrevo,
  siClaude,
  siDocker,
  siFacebook,
  siFramer,
  siGithub,
  siGmail,
  siGooglesheets,
  siImessage,
  siMake,
  siMeta,
  siModelcontextprotocol,
  siN8n,
  siTelegram,
  siWebflow,
  siWhatsapp,
  siWordpress,
  siZapier,
  type SimpleIcon,
} from 'simple-icons'
import { FileSpreadsheet, FormInput, Mail, Webhook, type LucideIcon } from 'lucide-react'
import { BrandMark } from './brand-mark'

/**
 * Logos of the products Outbound OS works with, shown in their own colours so
 * a visitor recognises them before reading a word.
 *
 * Paths come from Simple Icons (CC0). Brands it does not carry get a lettered
 * tile rather than a hand-drawn imitation of their logo; generic concepts
 * (email, webhooks, CSV) get an icon. Trademarks belong to their owners and
 * are used only to say what connects to what.
 */

type Brand =
  | { kind: 'si'; title: string; hex: string; path: string }
  | { kind: 'mono'; title: string; hex: string; letters: string }
  | { kind: 'icon'; title: string; hex: string; Icon: LucideIcon }
  | { kind: 'self'; title: string; hex: string }

const si = (icon: SimpleIcon): Brand => ({ kind: 'si', title: icon.title, hex: `#${icon.hex}`, path: icon.path })

export const brands = {
  whatsapp: si(siWhatsapp),
  meta: si(siMeta),
  facebook: si(siFacebook),
  telegram: si(siTelegram),
  imessage: si(siImessage),
  gmail: si(siGmail),
  brevo: si(siBrevo),
  zapier: si(siZapier),
  make: si(siMake),
  n8n: si(siN8n),
  sheets: si(siGooglesheets),
  claude: si(siClaude),
  mcp: si(siModelcontextprotocol),
  docker: si(siDocker),
  github: si(siGithub),
  webflow: si(siWebflow),
  wordpress: si(siWordpress),
  framer: si(siFramer),
  // Not in Simple Icons: a lettered tile, never an imitation of their mark.
  indiamart: { kind: 'mono', title: 'IndiaMART', hex: '#b45309', letters: 'IM' },
  aisensy: { kind: 'mono', title: 'AiSensy', hex: '#0f766e', letters: 'Ai' },
  tradeindia: { kind: 'mono', title: 'TradeIndia', hex: '#1d4ed8', letters: 'TI' },
  justdial: { kind: 'mono', title: 'JustDial', hex: '#c2410c', letters: 'JD' },
  engyne: { kind: 'mono', title: 'Engyne Cloud', hex: '#4338ca', letters: 'En' },
  email: { kind: 'icon', title: 'Email', hex: '#7c3aed', Icon: Mail },
  webhooks: { kind: 'icon', title: 'Webhooks', hex: '#17171c', Icon: Webhook },
  csv: { kind: 'icon', title: 'CSV', hex: '#15803d', Icon: FileSpreadsheet },
  forms: { kind: 'icon', title: 'Website forms', hex: '#2c3fe0', Icon: FormInput },
  outboundos: { kind: 'self', title: 'Outbound OS', hex: '#17171c' },
} satisfies Record<string, Brand>

export type BrandName = keyof typeof brands

/** Which logo stands for each integration page. */
export const integrationBrand: Record<string, BrandName> = {
  'whatsapp-cloud-api': 'whatsapp',
  aisensy: 'aisensy',
  email: 'email',
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

/**
 * An app-icon style tile: the brand colour as the ground, the mark in white.
 * `label` makes it a named image; without it the tile is decorative and the
 * text beside it carries the name.
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
  const glyph = Math.round(size * 0.52)
  const style = { '--tile': b.hex, width: size, height: size } as CSSProperties
  const a11y = label ? { role: 'img', 'aria-label': b.title } : { 'aria-hidden': true }

  return (
    <span className={['logo-tile', className].filter(Boolean).join(' ')} style={style} {...a11y}>
      {b.kind === 'si' && (
        <svg viewBox="0 0 24 24" width={glyph} height={glyph} fill="currentColor" aria-hidden="true">
          <path d={b.path} />
        </svg>
      )}
      {b.kind === 'mono' && (
        <span className="logo-tile__letters" style={{ fontSize: Math.round(size * 0.36) }}>
          {b.letters}
        </span>
      )}
      {b.kind === 'icon' && <b.Icon size={glyph} strokeWidth={2} aria-hidden="true" />}
      {b.kind === 'self' && <BrandMark className="logo-tile__self" />}
    </span>
  )
}

export function brandTitle(brand: BrandName) {
  return brands[brand].title
}
