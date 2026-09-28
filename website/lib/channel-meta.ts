/**
 * Channel identity, shared by every visual on the site.
 *
 * Mirrors `web/src/lib/channels.ts` in the dashboard so a channel means the
 * same thing — and is the same colour — in the marketing site and inside the
 * product. Defined once here so no visual invents its own green.
 */
export type ChannelKey = 'whatsapp' | 'email' | 'indiamart'

type ChannelMeta = { label: string; token: string; glyph: string }

const CHANNELS: Record<ChannelKey, ChannelMeta> = {
  whatsapp: { label: 'WhatsApp', token: '--whatsapp', glyph: '◍' },
  email: { label: 'Email', token: '--email', glyph: '✉' },
  indiamart: { label: 'IndiaMART', token: '--indiamart', glyph: '◈' },
}

export function getChannelMeta(key: ChannelKey): ChannelMeta {
  return CHANNELS[key]
}

export const CHANNEL_KEYS = Object.keys(CHANNELS) as ChannelKey[]
