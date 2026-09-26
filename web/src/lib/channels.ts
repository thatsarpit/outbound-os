import { Mail, MessageCircle, MessageSquare, Send } from 'lucide-react'
import type { LucideIcon } from 'lucide-react'
import type { InboxChannel } from '@/api/types'

/**
 * Single source of truth for channel identity.
 *
 * Every surface that shows a channel — thread rows, the conversation header,
 * message bubbles, the composer, filters, health strips — reads from here, so
 * a channel looks the same everywhere and adding a fifth channel is one entry
 * rather than a hunt through a dozen files.
 *
 * Identity is carried by icon + label first and colour second. The colours are
 * validated for colour-vision separation (see the channel block in globals.css)
 * but nothing should depend on hue alone to tell two channels apart.
 */

export type ChannelMeta = {
  id: InboxChannel
  /** Full name, for headers and filters. */
  label: string
  /** Shortened for very tight rows. */
  shortLabel: string
  icon: LucideIcon
  /** Tailwind text colour class. */
  text: string
  /** Tailwind background class for the tinted chip. */
  bg: string
  /** Tailwind background class for the solid rule / dot. */
  rule: string
  /** Tailwind border colour class. */
  border: string
  /** What an outbound message on this channel is called, for the composer. */
  sendVerb: string
}

export const CHANNELS: Record<InboxChannel, ChannelMeta> = {
  whatsapp: {
    id: 'whatsapp',
    label: 'WhatsApp',
    shortLabel: 'WA',
    icon: MessageSquare,
    text: 'text-whatsapp',
    bg: 'bg-whatsapp-muted',
    rule: 'bg-whatsapp',
    border: 'border-whatsapp/30',
    sendVerb: 'Send WhatsApp',
  },
  email: {
    id: 'email',
    label: 'Email',
    shortLabel: 'Email',
    icon: Mail,
    text: 'text-email',
    bg: 'bg-email-muted',
    rule: 'bg-email',
    border: 'border-email/30',
    sendVerb: 'Send email',
  },
  imessage: {
    id: 'imessage',
    label: 'iMessage',
    shortLabel: 'iMsg',
    icon: MessageCircle,
    text: 'text-imessage',
    bg: 'bg-imessage-muted',
    rule: 'bg-imessage',
    border: 'border-imessage/30',
    sendVerb: 'Send iMessage',
  },
  telegram: {
    id: 'telegram',
    label: 'Telegram',
    shortLabel: 'TG',
    icon: Send,
    text: 'text-telegram',
    bg: 'bg-telegram-muted',
    rule: 'bg-telegram',
    border: 'border-telegram/30',
    sendVerb: 'Send Telegram',
  },
}

/** Display order wherever channels are listed together. */
export const CHANNEL_ORDER: InboxChannel[] = ['whatsapp', 'email', 'imessage', 'telegram']

export function getChannel(channel: InboxChannel | string | null | undefined): ChannelMeta {
  if (channel && channel in CHANNELS) return CHANNELS[channel as InboxChannel]
  return CHANNELS.whatsapp
}

/**
 * Secondary line for a thread row — the most useful identifying detail for
 * that channel, since what identifies an email thread (its subject) is not
 * what identifies a WhatsApp one (the company or number).
 */
export function getThreadSubtitle(thread: {
  channel: InboxChannel
  subject?: string | null
  senderDisplay?: string | null
  leadCompany?: string | null
  leadEmail?: string | null
  leadMobile?: string | null
}): string | null {
  switch (thread.channel) {
    case 'email':
      return thread.subject || thread.senderDisplay || thread.leadEmail || null
    case 'telegram':
      return thread.senderDisplay || thread.leadCompany || thread.leadMobile || null
    default:
      return thread.leadCompany || thread.leadMobile || null
  }
}
