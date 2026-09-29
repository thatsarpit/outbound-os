import { queryClient } from '@/lib/query-client'
import { notificationActions } from '@/stores/notification-store'
import type { InboxChannel, InboxMessage, InboxSenderAccount } from '@/api/types'

/**
 * A working inbox for the demo, held in memory.
 *
 * Each sample conversation has its own messages. A message sent from the
 * composer is added to its thread and then moves through sent, delivered and
 * read the way a real WhatsApp message does; the first message to each lead
 * also gets a reply, which lands in the thread and the notification bell.
 * Files attached in the composer stay in this tab as object URLs. Nothing
 * leaves the browser, and a reload starts over.
 */

function ago(minutes: number) {
  return new Date(Date.now() - minutes * 60_000).toISOString()
}

type Thread = {
  leadId: number
  leadName: string
  leadCompany: string
  leadEmail: string | null
  leadMobile: string | null
  channel: InboxChannel
  threadKey: string
  subject: string | null
  senderAccountId: number
  assignedToId: number | null
  unread: boolean
  replyNeeded: boolean
  threadState: 'needs_reply' | 'assigned' | 'resolved'
  assignmentState: 'unassigned' | 'assigned' | 'assigned_to_me'
}

const SENDERS: Record<InboxChannel, InboxSenderAccount> = {
  whatsapp: { id: 1, channel: 'whatsapp', name: 'Acme Sales', email: null, senderName: 'Acme Sales', enabled: true, status: 'connected' },
  email: { id: 2, channel: 'email', name: 'Acme Sales', email: 'sales@acme.example', senderName: 'Maya from Acme', enabled: true, status: 'connected' },
  imessage: { id: 3, channel: 'imessage', name: 'Sales Mac', email: null, senderName: 'Acme Sales', enabled: true, status: 'connected' },
  telegram: { id: 4, channel: 'telegram', name: '@acme_sales', email: null, senderName: 'Acme Sales', enabled: true, status: 'connected' },
}

const THREADS: Thread[] = [
  {
    leadId: 1,
    leadName: 'Rohan Mehta',
    leadCompany: 'Meridian Distributors',
    leadEmail: 'rohan@meridian.example',
    leadMobile: '+91 98765 00001',
    channel: 'whatsapp',
    threadKey: 'wa-1',
    subject: null,
    senderAccountId: 1,
    assignedToId: null,
    unread: true,
    replyNeeded: true,
    threadState: 'needs_reply',
    assignmentState: 'unassigned',
  },
  {
    leadId: 2,
    leadName: 'Sarah Whitfield',
    leadCompany: 'Northwind Retail',
    leadEmail: 's.whitfield@northwind.example',
    leadMobile: null,
    channel: 'email',
    threadKey: 'em-2',
    subject: 'Re: Quotation for Q3 supply agreement',
    senderAccountId: 2,
    assignedToId: 3,
    unread: true,
    replyNeeded: true,
    threadState: 'assigned',
    assignmentState: 'assigned',
  },
  {
    leadId: 3,
    leadName: 'Daniel Okafor',
    leadCompany: 'Lagos Medical Supply',
    leadEmail: null,
    leadMobile: '+234 800 000 0001',
    channel: 'imessage',
    threadKey: 'im-3',
    subject: null,
    senderAccountId: 3,
    assignedToId: 1,
    unread: false,
    replyNeeded: false,
    threadState: 'assigned',
    assignmentState: 'assigned_to_me',
  },
  {
    leadId: 4,
    leadName: 'Priya Nair',
    leadCompany: 'Kerala Hardware Traders',
    leadEmail: 'priya@kerala-traders.example',
    leadMobile: '+91 98765 00002',
    channel: 'telegram',
    threadKey: 'tg-4',
    subject: null,
    senderAccountId: 4,
    assignedToId: null,
    unread: false,
    replyNeeded: true,
    threadState: 'needs_reply',
    assignmentState: 'unassigned',
  },
  {
    leadId: 5,
    leadName: 'Tomas Berg',
    leadCompany: 'Nordic Build AB',
    leadEmail: 'tomas@nordic.example',
    leadMobile: '+46 70 000 0001',
    channel: 'whatsapp',
    threadKey: 'wa-5',
    subject: null,
    senderAccountId: 1,
    assignedToId: 3,
    unread: false,
    replyNeeded: false,
    threadState: 'resolved',
    assignmentState: 'assigned',
  },
]

let nextId = 100

function message(
  leadId: number,
  direction: 'inbound' | 'outbound',
  minutesAgo: number,
  content: string,
  extra: Partial<InboxMessage> = {},
): InboxMessage {
  const thread = THREADS.find((t) => t.leadId === leadId)!
  const outbound = direction === 'outbound'
  return {
    id: (nextId += 1),
    leadId,
    channel: thread.channel,
    direction,
    content,
    subject: thread.channel === 'email' ? thread.subject : null,
    status: outbound ? 'read' : 'delivered',
    createdAt: ago(minutesAgo),
    sentAt: ago(minutesAgo),
    senderAccountId: outbound ? thread.senderAccountId : null,
    senderDisplay: outbound ? SENDERS[thread.channel].senderName : null,
    emailAccountId: thread.channel === 'email' && outbound ? 2 : null,
    emailMessageId: thread.channel === 'email' ? `<demo-${nextId}@acme.example>` : null,
    emailInReplyTo: null,
    waAccount: thread.channel === 'whatsapp' ? 1 : null,
    replyToMessageId: null,
    mediaUrl: null,
    mediaType: null,
    mediaCaption: null,
    mediaFilename: null,
    ...extra,
  }
}

/* A drawing and a price list for the WhatsApp thread, so the demo shows files
   going both ways. */
const DRAWING_SVG = `<svg xmlns="http://www.w3.org/2000/svg" width="480" height="300" viewBox="0 0 480 300">
<rect width="480" height="300" fill="#f8fafc"/>
<g fill="none" stroke="#334155" stroke-width="2">
<rect x="60" y="120" width="260" height="60"/><polygon points="320,110 380,110 395,150 380,190 320,190"/>
<path d="M60 120 L60 180" stroke-dasharray="6 4"/>
<path d="M60 220 L320 220 M60 214 L60 226 M320 214 L320 226"/>
</g>
<text x="190" y="242" font-family="sans-serif" font-size="14" fill="#334155" text-anchor="middle">40 mm</text>
<text x="30" y="40" font-family="sans-serif" font-size="16" font-weight="600" fill="#0f172a">M8 hex bolt · A4 stainless</text>
<text x="30" y="62" font-family="sans-serif" font-size="12" fill="#64748b">Drawing HB-08-40 · rev C</text>
</svg>`

const files = new Map<number, Blob>()

const MESSAGES: InboxMessage[] = [
  message(1, 'outbound', 95, 'Hi Rohan, thanks for your enquiry on our website about M8 hex bolts. We stock them in A2 and A4 stainless. How many do you need each month?'),
  message(1, 'inbound', 61, 'Hi, around 20,000 units a month. Can you share prices?'),
  message(1, 'outbound', 58, 'Here is our price list. M8 x 40 in A2 is on page 2.', {
    mediaType: 'pdf',
    mediaUrl: 'demo',
    mediaCaption: 'Here is our price list. M8 x 40 in A2 is on page 2.',
    mediaFilename: 'Acme-price-list-2026.pdf',
  }),
  message(1, 'inbound', 5, 'This is the drawing we work to. Can you do A4 at the A2 price if we commit for a year?', {
    mediaType: 'image',
    mediaUrl: 'demo',
    mediaCaption: 'This is the drawing we work to. Can you do A4 at the A2 price if we commit for a year?',
    mediaFilename: 'bolt-drawing.svg',
  }),

  message(2, 'outbound', 300, 'Hi Sarah,\n\nAs promised, here are the revised terms for the Q3 supply agreement: 5,000 boxes of 600x600 LED panels, delivered in three drops, net 45 payment.\n\nBest,\nMaya'),
  message(2, 'inbound', 38, 'Hi Maya,\n\nThanks for the revised terms. Our procurement lead has two questions on MOQ: can the first drop be 1,000 boxes instead of 1,700, and is the price held if we reorder in Q4?\n\nSarah'),

  message(3, 'outbound', 140, 'Shipping documents for order ACM-1038 are on their way by email: invoice, packing list and certificate of origin.'),
  message(3, 'inbound', 122, 'Perfect, shipping docs received. We will confirm payment on Monday.'),

  message(4, 'inbound', 190, 'Enquiry: M10 hex bolts, 50,000 pieces, monthly. Galvanised is fine. Delivery to Kochi.'),

  message(5, 'outbound', 1500, 'Your order ACM-1042 is packed and ships tomorrow morning. Tracking follows once it is collected.'),
  message(5, 'inbound', 1450, 'Order confirmed. Thanks for the quick turnaround.'),
]

files.set(MESSAGES[2].id, new Blob(['%PDF-1.4\n% Acme Supplies price list (demo)\n'], { type: 'application/pdf' }))
files.set(MESSAGES[3].id, new Blob([DRAWING_SVG], { type: 'image/svg+xml' }))

/* One reply per lead, the first time you write to them. */
const REPLIES: Record<number, string> = {
  1: 'That works for us. Please send a proforma invoice for the first 20,000 in A4.',
  2: 'Thanks Maya, that answers both questions. I will take it to our procurement lead today.',
  3: 'Thank you. Payment is scheduled for Monday morning.',
  4: 'Yes please, send a quote with delivery to Kochi included.',
  5: 'Received, thanks. We will reorder next month.',
}
const replied = new Set<number>()

function summary(thread: Thread) {
  const own = MESSAGES.filter((m) => m.leadId === thread.leadId)
  const last = own[own.length - 1]
  const lastIn = [...own].reverse().find((m) => m.direction === 'inbound')
  const lastOut = [...own].reverse().find((m) => m.direction === 'outbound')
  const preview = last?.mediaType && !last.mediaCaption ? `[${last.mediaFilename}]` : last?.content ?? ''
  return {
    ...thread,
    name: thread.leadName,
    senderDisplay: thread.channel === 'email' ? SENDERS.email.email : thread.channel === 'telegram' ? 'Telegram · @acme_sales' : null,
    assignedEmailAccountId: thread.channel === 'email' ? 2 : null,
    lastMessage: preview,
    lastMessagePreview: preview,
    lastMessageAt: last?.createdAt ?? null,
    lastInboundAt: lastIn?.createdAt ?? null,
    lastOutboundAt: lastOut?.createdAt ?? null,
  }
}

function json(body: unknown, status = 200) {
  return new Response(JSON.stringify(body), { status, headers: { 'Content-Type': 'application/json' } })
}

function refresh(leadId: number) {
  void queryClient.invalidateQueries({ queryKey: ['inbox-thread', leadId] })
  void queryClient.invalidateQueries({ queryKey: ['inbox-threads'] })
}

/** Move a sent message along the way WhatsApp reports it, then reply once. */
function playDelivery(sent: InboxMessage[], thread: Thread) {
  const step = (status: InboxMessage['status'], delay: number) =>
    window.setTimeout(() => {
      for (const m of sent) m.status = status
      refresh(thread.leadId)
    }, delay)
  step('delivered', 1200)
  if (thread.channel !== 'email') step('read', 2600)

  if (replied.has(thread.leadId)) return
  replied.add(thread.leadId)
  window.setTimeout(() => {
    const reply = message(thread.leadId, 'inbound', 0, REPLIES[thread.leadId] ?? 'Thanks, received.')
    MESSAGES.push(reply)
    thread.unread = true
    thread.replyNeeded = true
    thread.threadState = thread.assignmentState === 'unassigned' ? 'needs_reply' : 'assigned'
    refresh(thread.leadId)
    notificationActions.addNotification({
      id: `demo-reply-${reply.id}`,
      title: `${thread.leadName} replied`,
      message: `${thread.leadName} replied: "${reply.content}"`,
      timestamp: reply.createdAt,
      severity: 'success',
      kind: 'reply_received',
      leadId: thread.leadId,
      channel: thread.channel === 'telegram' ? null : thread.channel,
      threadKey: thread.threadKey,
      read: false,
    })
  }, 5200)
}

async function readBody(init?: RequestInit): Promise<Record<string, unknown>> {
  if (!init?.body || typeof init.body !== 'string') return {}
  try {
    return JSON.parse(init.body) as Record<string, unknown>
  } catch {
    return {}
  }
}

/**
 * Answers the inbox's requests from memory. Returns null for anything that is
 * not the inbox, so the caller can fall through to the static fixtures.
 */
export async function handleInboxRequest(url: string, init?: RequestInit): Promise<Response | null> {
  const method = (init?.method || 'GET').toUpperCase()
  const path = new URL(url, window.location.origin)

  const media = path.pathname.match(/\/api\/messages\/(\d+)\/media$/)
  if (media) {
    const blob = files.get(Number(media[1]))
    return blob ? new Response(blob, { status: 200, headers: { 'Content-Type': blob.type } }) : json({ error: 'Not found' }, 404)
  }

  if (path.pathname.endsWith('/api/media/upload') && method === 'POST') {
    const file = init?.body instanceof FormData ? init.body.get('file') : null
    if (!(file instanceof File)) return json({ error: 'No file' }, 400)
    const id = (nextId += 1)
    files.set(id, file)
    return json({
      id,
      filename: file.name,
      originalName: file.name,
      mimeType: file.type || 'application/octet-stream',
      size: file.size,
      path: `demo/${file.name}`,
      createdAt: new Date().toISOString(),
    })
  }
  if (/\/api\/media\/\d+$/.test(path.pathname) && method === 'DELETE') {
    return new Response(null, { status: 204 })
  }

  if (path.pathname.endsWith('/api/inbox/senders')) {
    return json(Object.values(SENDERS))
  }

  const detail = path.pathname.match(/\/api\/inbox\/threads\/(\d+)(\/(resolve|reopen|assign-self))?$/)
  if (detail) {
    const thread = THREADS.find((t) => t.leadId === Number(detail[1]))
    if (!thread) return json({ error: 'Conversation not found' }, 404)
    const action = detail[3]
    if (action === 'resolve') {
      thread.threadState = 'resolved'
      thread.replyNeeded = false
    } else if (action === 'reopen') {
      thread.threadState = thread.assignmentState === 'unassigned' ? 'needs_reply' : 'assigned'
    } else if (action === 'assign-self') {
      thread.assignedToId = 1
      thread.assignmentState = 'assigned_to_me'
      if (thread.threadState === 'needs_reply') thread.threadState = 'assigned'
    } else {
      thread.unread = false
    }
    if (action) refresh(thread.leadId)
    return json({
      ...summary(thread),
      id: thread.leadId,
      status: thread.threadState,
      messages: MESSAGES.filter((m) => m.leadId === thread.leadId),
      senderAccount: SENDERS[thread.channel],
      availableSenderAccounts: [SENDERS[thread.channel]],
    })
  }

  if (path.pathname.endsWith('/api/inbox/threads')) {
    const channel = path.searchParams.get('channel')
    const state = path.searchParams.get('state')
    const search = (path.searchParams.get('search') || '').toLowerCase()
    const threads = THREADS.map(summary)
      .filter((t) => !channel || t.channel === channel)
      .filter((t) => {
        if (!state || state === 'all') return true
        if (state === 'needs_reply') return t.replyNeeded
        if (state === 'assigned') return t.assignmentState !== 'unassigned'
        if (state === 'unassigned') return t.assignmentState === 'unassigned'
        return t.threadState === state
      })
      .filter((t) => !search || `${t.leadName} ${t.leadCompany} ${t.lastMessage}`.toLowerCase().includes(search))
      .sort((a, b) => String(b.lastMessageAt).localeCompare(String(a.lastMessageAt)))
    return json({
      threads,
      total: threads.length,
      page: 1,
      pages: 1,
      unread: THREADS.filter((t) => t.unread).length,
      needsReply: THREADS.filter((t) => t.replyNeeded && t.threadState !== 'resolved').length,
    })
  }

  if (path.pathname.endsWith('/api/inbox/send') && method === 'POST') {
    const body = await readBody(init)
    const thread = THREADS.find((t) => t.leadId === Number(body.leadId))
    if (!thread) return json({ error: 'Conversation not found' }, 404)
    const text = String(body.text ?? body.body ?? '').trim()
    const attachmentIds = Array.isArray(body.attachmentIds) ? (body.attachmentIds as number[]) : []
    const sent: InboxMessage[] = []

    attachmentIds.forEach((fileId, index) => {
      const file = files.get(fileId)
      if (!file) return
      const kind = file.type.startsWith('image/') ? 'image' : file.type.startsWith('video/') ? 'video' : file.type.startsWith('audio/') ? 'audio' : file.type === 'application/pdf' ? 'pdf' : 'document'
      const caption = index === 0 ? text : ''
      const m = message(thread.leadId, 'outbound', 0, caption || `[${file instanceof File ? file.name : 'file'}]`, {
        status: 'sent',
        mediaType: kind,
        mediaUrl: 'demo',
        mediaCaption: caption || null,
        mediaFilename: file instanceof File ? file.name : 'file',
      })
      files.set(m.id, file)
      sent.push(m)
    })
    if (sent.length === 0) {
      if (!text) return json({ error: 'Reply cannot be empty' }, 400)
      sent.push(message(thread.leadId, 'outbound', 0, text, { status: 'sent' }))
    }

    MESSAGES.push(...sent)
    thread.unread = false
    thread.replyNeeded = false
    if (thread.threadState === 'needs_reply') thread.threadState = 'assigned'
    playDelivery(sent, thread)
    return json({ success: true, message: sent[sent.length - 1] })
  }

  return null
}
