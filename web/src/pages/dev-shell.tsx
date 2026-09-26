import { AppShell } from '@/components/layout/app-shell'
import { useAuthStore } from '@/stores/auth-store'
import { notificationActions, useNotificationStore } from '@/stores/notification-store'
import type { ActivityLog } from '@/api/types'

/**
 * Dev-only harness for reviewing the application shell without a backend.
 *
 * The shell is otherwise only reachable behind authentication, which makes the
 * chrome — sidebar, top bar, command palette, layout rhythm — awkward to review
 * while it is being built. This seeds the auth store with fixture
 * data and renders the real `AppShell`, so what you see is the shipping
 * component rather than a mock of it.
 *
 * Gated on `import.meta.env.DEV` at the route level, so it is tree-shaken out
 * of production builds. This is the first, smallest version of the "product
 * frames" idea: real components fed by fixtures instead of the API.
 */

/**
 * Fixture responses for the handful of calls the shell makes on mount.
 * Without this the API client receives 401s and hard-redirects to /login,
 * which is exactly what makes the shell hard to review in the first place.
 */
function daySeries(days: number, base: number, spread: number) {
  const out: Array<{ day: string; count: number }> = []
  for (let i = days - 1; i >= 0; i--) {
    const d = new Date()
    d.setDate(d.getDate() - i)
    const wave = Math.sin((days - i) / 2.2) * spread
    out.push({
      day: d.toISOString().slice(0, 10),
      count: Math.max(0, Math.round(base + wave + ((i * 7) % 11) - 5)),
    })
  }
  return out
}

/* ── Inbox fixtures ──
 * A deliberately mixed-channel set: the point of the inbox design is that a
 * WhatsApp, an email, an iMessage and a Telegram thread sit next to each
 * other and stay tellable apart, so the preview has to show exactly that. */
function ago(minutes: number) {
  return new Date(Date.now() - minutes * 60_000).toISOString()
}

const FIXTURE_LEADS = [
  {
    id: 1,
    name: 'Rohan Mehta',
    company: 'Meridian Distributors',
    mobile: '+91 98765 00001',
    email: 'rohan@meridian.example',
    country: 'India',
    product: 'Stainless hex bolts M8',
    quantity: '20,000 units',
    status: 'replied',
    leadTier: 'HOT',
    score: 82,
    source: 'website',
    isOnWhatsApp: true,
    followupCount: 1,
    assignedTo: null,
    createdAt: ago(240),
    lastMessageAt: ago(4),
  },
  {
    id: 2,
    name: 'Sarah Whitfield',
    company: 'Northwind Retail',
    mobile: '',
    email: 's.whitfield@northwind.example',
    country: 'United Kingdom',
    product: 'LED panel lights 600x600',
    quantity: '5,000 boxes',
    status: 'engaged',
    leadTier: 'HOT',
    score: 76,
    source: 'website',
    isOnWhatsApp: false,
    followupCount: 3,
    assignedTo: null,
    createdAt: ago(900),
    lastMessageAt: ago(38),
  },
  {
    id: 3,
    name: 'Daniel Okafor',
    company: 'Lagos Medical Supply',
    mobile: '+234 800 000 0001',
    email: null,
    country: 'Nigeria',
    product: 'Cotton work gloves',
    quantity: '12,000 pairs',
    status: 'contacted',
    leadTier: 'WARM',
    score: 54,
    source: 'csv_import',
    isOnWhatsApp: true,
    followupCount: 2,
    assignedTo: null,
    createdAt: ago(2400),
    lastMessageAt: ago(122),
  },
]

const FIXTURE_THREADS = [
  {
    leadId: 1,
    leadName: 'Rohan Mehta',
    name: 'Rohan Mehta',
    leadCompany: 'Meridian Distributors',
    leadEmail: 'rohan@meridian.example',
    leadMobile: '+91 98765 00001',
    channel: 'whatsapp',
    threadKey: 'wa-1',
    subject: null,
    senderDisplay: null,
    senderAccountId: 1,
    assignedEmailAccountId: null,
    assignedToId: null,
    unread: true,
    replyNeeded: true,
    threadState: 'needs_reply',
    assignmentState: 'unassigned',
    lastMessage: 'Can you share the price list for the M8 bolts? We need 20,000 units.',
    lastMessagePreview: 'Can you share the price list for the M8 bolts? We need 20,000 units.',
    lastMessageAt: ago(4),
    lastInboundAt: ago(4),
    lastOutboundAt: ago(90),
  },
  {
    leadId: 2,
    leadName: 'Sarah Whitfield',
    name: 'Sarah Whitfield',
    leadCompany: 'Northwind Retail',
    leadEmail: 's.whitfield@northwind.example',
    leadMobile: null,
    channel: 'email',
    threadKey: 'em-2',
    subject: 'Re: Quotation for Q3 supply agreement',
    senderDisplay: 'sales@outboundos.space',
    senderAccountId: 2,
    assignedEmailAccountId: 2,
    assignedToId: 3,
    unread: true,
    replyNeeded: true,
    threadState: 'assigned',
    assignmentState: 'assigned',
    lastMessage: 'Thanks for the revised terms. Our procurement lead has two questions on MOQ.',
    lastMessagePreview:
      'Thanks for the revised terms. Our procurement lead has two questions on MOQ.',
    lastMessageAt: ago(38),
    lastInboundAt: ago(38),
    lastOutboundAt: ago(300),
  },
  {
    leadId: 3,
    leadName: 'Daniel Okafor',
    name: 'Daniel Okafor',
    leadCompany: 'Lagos Medical Supply',
    leadEmail: null,
    leadMobile: '+234 800 000 0001',
    channel: 'imessage',
    threadKey: 'im-3',
    subject: null,
    senderDisplay: null,
    senderAccountId: 3,
    assignedEmailAccountId: null,
    assignedToId: null,
    unread: false,
    replyNeeded: false,
    threadState: 'assigned',
    assignmentState: 'assigned_to_me',
    lastMessage: 'Perfect, shipping docs received. We will confirm payment on Monday.',
    lastMessagePreview: 'Perfect, shipping docs received. We will confirm payment on Monday.',
    lastMessageAt: ago(122),
    lastInboundAt: ago(122),
    lastOutboundAt: ago(140),
  },
  {
    leadId: 4,
    leadName: 'Priya Nair',
    name: 'Priya Nair',
    leadCompany: 'Kerala Hardware Traders',
    leadEmail: 'priya@kerala-traders.example',
    leadMobile: '+91 98765 00002',
    channel: 'telegram',
    threadKey: 'tg-4',
    subject: null,
    senderDisplay: 'Telegram · @acme_sales',
    senderAccountId: 4,
    assignedEmailAccountId: null,
    assignedToId: null,
    unread: false,
    replyNeeded: true,
    threadState: 'needs_reply',
    assignmentState: 'unassigned',
    lastMessage: 'Enquiry: M10 hex bolts — 50,000 pieces, monthly.',
    lastMessagePreview: 'Enquiry: M10 hex bolts — 50,000 pieces, monthly.',
    lastMessageAt: ago(190),
    lastInboundAt: ago(190),
    lastOutboundAt: null,
  },
  {
    leadId: 5,
    leadName: 'Tomas Berg',
    name: 'Tomas Berg',
    leadCompany: 'Nordic Build AB',
    leadEmail: 'tomas@nordic.example',
    leadMobile: '+46 70 000 0001',
    channel: 'whatsapp',
    threadKey: 'wa-5',
    subject: null,
    senderDisplay: null,
    senderAccountId: 1,
    assignedEmailAccountId: null,
    assignedToId: 3,
    unread: false,
    replyNeeded: false,
    threadState: 'resolved',
    assignmentState: 'assigned',
    lastMessage: 'Order confirmed. Thanks for the quick turnaround.',
    lastMessagePreview: 'Order confirmed. Thanks for the quick turnaround.',
    lastMessageAt: ago(1450),
    lastInboundAt: ago(1450),
    lastOutboundAt: ago(1500),
  },
]

const FIXTURE_MESSAGES = [
  {
    id: 11,
    leadId: 1,
    channel: 'whatsapp',
    direction: 'outbound',
    content:
      'Hi Rohan, thanks for your enquiry on our website. We stock the M8 bolts in A2 and A4 stainless. Happy to share the full price list.',
    subject: null,
    status: 'delivered',
    createdAt: ago(95),
    sentAt: ago(95),
    senderAccountId: 1,
    senderDisplay: 'Acme Sales',
    emailAccountId: null,
    emailMessageId: null,
    emailInReplyTo: null,
    waAccount: 1,
    replyToMessageId: null,
    mediaUrl: null,
    mediaType: null,
    mediaCaption: null,
  },
  {
    id: 12,
    leadId: 1,
    channel: 'whatsapp',
    direction: 'inbound',
    content: 'Can you share the price list for the M8 bolts? We need 20,000 units.',
    subject: null,
    status: 'received',
    createdAt: ago(4),
    sentAt: ago(4),
    senderAccountId: null,
    senderDisplay: null,
    emailAccountId: null,
    emailMessageId: null,
    emailInReplyTo: null,
    waAccount: 1,
    replyToMessageId: null,
    mediaUrl: null,
    mediaType: null,
    mediaCaption: null,
  },
]

/* ── Notification fixtures ──
 * Shaped as `ActivityLog` rows, because that is what the notification hook
 * hydrates from (`GET /notifications`) before normalising them into store
 * items. The set deliberately covers all four severities, rows with and
 * without a channel, and the kinds that make a "Pause lead" action eligible,
 * so the panel can be reviewed at full density rather than half empty. */
const FIXTURE_NOTIFICATIONS: ActivityLog[] = [
  {
    id: 'n1',
    type: 'email_sync_failed',
    message: 'sales@outboundos.space could not be synced: IMAP authentication rejected.',
    accountId: 2,
    leadId: null,
    timestamp: ago(3),
  },
  {
    id: 'n2',
    type: 'reply_received',
    message: 'Rohan Mehta replied: "Can you share the price list for the M8 bolts?"',
    leadId: 1,
    accountId: 1,
    data: { channel: 'whatsapp' },
    timestamp: ago(7),
  },
  {
    id: 'n3',
    type: 'email_reply',
    message: 'Sarah Whitfield replied about "Re: Quotation for Q3 supply agreement".',
    leadId: 2,
    accountId: 2,
    timestamp: ago(38),
  },
  {
    id: 'n4',
    type: 'message_failed',
    message: 'WhatsApp delivery to +234 800 000 0001 failed after three attempts.',
    leadId: 3,
    accountId: 1,
    data: { channel: 'whatsapp' },
    timestamp: ago(64),
  },
  {
    id: 'n5',
    type: 'email_sent',
    message: 'Sent "Updated MOQ tiers and lead times" from the dashboard.',
    leadId: 2,
    accountId: 2,
    timestamp: ago(96),
  },
  {
    id: 'n6',
    type: 'lead_intervention',
    message: 'Priya Nair has gone three follow-ups without a reply and needs a human.',
    leadId: 4,
    timestamp: ago(150),
  },
  {
    id: 'n7',
    type: 'import_completed',
    message: 'Imported 240 contacts from distributors-q3.csv, 6 rows skipped.',
    timestamp: ago(320),
  },
  {
    id: 'n8',
    type: 'system',
    message: 'Outbound sending resumed after the nightly maintenance window.',
    timestamp: ago(700),
  },
]

type FixtureValue = unknown | ((url: string) => unknown)

/* Sell-side fixtures. Without these the Orders, Customers and Revenue pages
   render only their empty states here, which meant the links between them
   could not be exercised in the preview shell at all. */
const FIXTURE_ORDER_ITEMS = [
  {
    id: 1,
    orderId: 1,
    productName: 'LED Panel Light',
    strength: '40W',
    packing: 'Box of 100',
    hsnCode: '3004',
    quantity: 120,
    unit: 'box',
    unitPrice: 450,
    lineTotal: 54000,
    sortOrder: 0,
  },
  {
    id: 2,
    orderId: 1,
    productName: 'Safety Helmet',
    strength: 'Class E',
    packing: '10x10',
    hsnCode: '3004',
    quantity: 40,
    unit: 'strip',
    unitPrice: 220,
    lineTotal: 8800,
    sortOrder: 1,
  },
]

const FIXTURE_ORDERS = [
  {
    id: 1,
    leadId: 12,
    customerId: 1,
    orderNumber: 'SO2627-0001',
    status: 'shipped',
    customerName: 'Dana Whitaker',
    customerCompany: 'Harbor Supply Co.',
    customerEmail: 'dana@harbor.example',
    customerPhone: '+1-404-555-0142',
    country: 'United States Of America',
    billingAddress: null,
    shippingAddress: '100 Example Avenue\nAtlanta, GA 30303',
    currency: 'USD',
    subtotal: 62800,
    discountTotal: 0,
    taxTotal: 0,
    total: 62800,
    incoterms: 'DDP',
    portOfDestination: 'Los Angeles',
    paymentTerms: '50% advance',
    notes: null,
    confirmedAt: '2026-08-24T09:10:00Z',
    createdAt: '2026-08-24T09:00:00Z',
    updatedAt: '2026-08-28T12:00:00Z',
    items: FIXTURE_ORDER_ITEMS,
    invoices: [
      {
        id: 1,
        orderId: 1,
        number: 'INV2627-0001',
        status: 'issued',
        currency: 'USD',
        subtotal: 62800,
        taxTotal: 0,
        total: 62800,
        amountPaid: 31400,
        taxRate: null,
        placeOfSupply: null,
        issuedAt: '2026-08-24T10:00:00Z',
        dueAt: '2026-09-08T00:00:00Z',
        paidAt: null,
        pdfUrl: null,
        notes: null,
        createdAt: '2026-08-24T10:00:00Z',
      },
    ],
    shipments: [
      {
        id: 1,
        orderId: 1,
        carrier: 'dhl',
        trackingNumber: '4381729056',
        trackingUrl: 'https://www.dhl.com/en/express/tracking.html?AWB=4381729056',
        status: 'in_transit',
        lastStatusRaw: 'In transit — Leipzig hub',
        lastCheckedAt: null,
        lastError: null,
        shippedAt: '2026-08-28T08:00:00Z',
        estimatedDelivery: '2026-09-06T00:00:00Z',
        deliveredAt: null,
        packageCount: 3,
        weightGrams: 14200,
        notes: null,
        createdAt: '2026-08-28T08:00:00Z',
      },
      // Dispatched but the courier has not returned a number yet. This is a real
      // and common state — the customer is only notified once the number lands —
      // so the fixture carries it to keep that path reviewable.
      {
        id: 2,
        orderId: 1,
        carrier: 'fedex',
        trackingNumber: null,
        trackingUrl: null,
        status: 'pending',
        lastStatusRaw: null,
        lastCheckedAt: null,
        lastError: null,
        shippedAt: null,
        estimatedDelivery: null,
        deliveredAt: null,
        packageCount: 1,
        weightGrams: 2100,
        notes: null,
        createdAt: '2026-09-01T09:30:00Z',
      },
    ],
    lead: { id: 12, name: 'Dana Whitaker', company: 'Harbor Supply Co.' },
  },
  {
    id: 2,
    leadId: null,
    customerId: 2,
    orderNumber: 'SO2627-0002',
    status: 'confirmed',
    customerName: 'Lucía Ortega',
    customerCompany: 'Ortega Suministros SL',
    customerEmail: 'lucia@ortega.example',
    customerPhone: '+34-600-000-111',
    country: 'Spain',
    billingAddress: null,
    shippingAddress: null,
    currency: 'EUR',
    subtotal: 21000,
    discountTotal: 1000,
    taxTotal: 0,
    total: 20000,
    incoterms: 'FOB',
    portOfDestination: 'Valencia',
    paymentTerms: 'Net 30',
    notes: null,
    confirmedAt: '2026-09-01T11:00:00Z',
    createdAt: '2026-09-01T10:30:00Z',
    updatedAt: '2026-09-01T11:00:00Z',
    items: [],
    invoices: [],
    shipments: [],
    lead: null,
  },
]

const FIXTURE_CUSTOMERS = [
  {
    id: 1,
    leadId: 12,
    name: 'Dana Whitaker',
    company: 'Harbor Supply Co.',
    email: 'dana@harbor.example',
    phone: '+1-404-555-0142',
    country: 'United States Of America',
    billingAddress: null,
    shippingAddress: null,
    gstin: null,
    taxId: null,
    status: 'active',
    currency: 'USD',
    notifyChannel: 'both',
    totalOrders: 3,
    lifetimeValue: 184500,
    lastOrderAt: '2026-08-24T09:00:00Z',
    notes: null,
    tags: null,
    createdAt: '2026-05-02T09:00:00Z',
  },
  {
    id: 2,
    leadId: null,
    name: 'Lucía Ortega',
    company: 'Ortega Suministros SL',
    email: 'lucia@ortega.example',
    phone: '+34-600-000-111',
    country: 'Spain',
    billingAddress: null,
    shippingAddress: null,
    gstin: null,
    taxId: null,
    status: 'active',
    currency: 'EUR',
    notifyChannel: 'email',
    totalOrders: 1,
    lifetimeValue: 20000,
    lastOrderAt: '2026-09-01T10:30:00Z',
    notes: null,
    tags: null,
    createdAt: '2026-09-01T10:00:00Z',
  },
]

const FIXTURE_RESPONSES: Array<[RegExp, FixtureValue]> = [
  [
    /\/auth\/me$/,
    { user: { sub: 0, name: 'Preview User', email: 'preview@localhost', role: 'admin' } },
  ],
  [
    /\/products\/performance/,
    {
      data: [
        {
          product: {
            id: 1,
            name: 'Hex Bolt M8',
            strength: 'A2 stainless',
            defaultUnit: 'box',
            sellCurrency: 'USD',
          },
          lineCount: 6,
          quantity: 940,
          revenue: 1128000,
          costInr: 45120000,
        },
        {
          product: {
            id: 2,
            name: 'Cable Ties',
            strength: '300mm',
            defaultUnit: 'box',
            sellCurrency: 'USD',
          },
          lineCount: 4,
          quantity: 610,
          revenue: 793000,
          costInr: 30500000,
        },
        {
          product: {
            id: 3,
            name: 'LED Panel Light',
            strength: '40W',
            defaultUnit: 'box',
            sellCurrency: 'USD',
          },
          lineCount: 3,
          quantity: 300,
          revenue: 405000,
          costInr: 15000000,
        },
      ],
      unlinkedLines: 2,
    },
  ],
  [
    /\/products\/suggestions/,
    {
      data: [
        { name: 'Solar Inverter', askedFor: 37 },
        { name: 'Safety Helmet', askedFor: 33 },
        { name: 'Copper Cable 4mm', askedFor: 53 },
        { name: 'Industrial Fan', askedFor: 21 },
      ],
    },
  ],
  [
    /\/products/,
    {
      data: [
        {
          id: 1,
          name: 'Hex Bolt M8',
          strength: 'A2 stainless',
          packing: 'Box of 100',
          hsnCode: '3004',
          sku: null,
          defaultUnit: 'box',
          sellPrice: 1200,
          sellCurrency: 'USD',
          costInr: 48000,
          supplierId: 1,
          supplier: { id: 1, name: 'Acme Manufacturing' },
          active: true,
          notes: null,
          createdAt: '2026-08-01T00:00:00Z',
        },
        {
          id: 2,
          name: 'Cable Ties',
          strength: '300mm',
          packing: '10x10',
          hsnCode: '3004',
          sku: null,
          defaultUnit: 'box',
          sellPrice: 1300,
          sellCurrency: 'USD',
          costInr: 50000,
          supplierId: 1,
          supplier: { id: 1, name: 'Acme Manufacturing' },
          active: true,
          notes: null,
          createdAt: '2026-08-02T00:00:00Z',
        },
        {
          id: 3,
          name: 'LED Panel Light',
          strength: '40W',
          packing: 'Box of 100',
          hsnCode: '3004',
          sku: null,
          defaultUnit: 'box',
          sellPrice: 1350,
          sellCurrency: 'USD',
          costInr: 50000,
          supplierId: 2,
          supplier: { id: 2, name: 'Northwind Traders' },
          active: true,
          notes: null,
          createdAt: '2026-08-03T00:00:00Z',
        },
      ],
      total: 3,
    },
  ],
  [
    /\/payment-methods/,
    {
      data: [
        {
          id: 1,
          name: 'Indian bank transfer',
          feeBps: 0,
          feeFixed: 0,
          passOnByDefault: false,
          enabled: true,
          sortOrder: 1,
          notes: null,
        },
        {
          id: 2,
          name: 'Wise transfer',
          feeBps: 0,
          feeFixed: 0,
          passOnByDefault: false,
          enabled: true,
          sortOrder: 2,
          notes: null,
        },
        {
          id: 3,
          name: 'Bank transfer (UK)',
          feeBps: 1000,
          feeFixed: 0,
          passOnByDefault: false,
          enabled: true,
          sortOrder: 3,
          notes: null,
        },
        {
          id: 5,
          name: 'PayPal',
          feeBps: 1000,
          feeFixed: 0,
          passOnByDefault: false,
          enabled: true,
          sortOrder: 5,
          notes: null,
        },
        {
          id: 6,
          name: 'ACH transfer',
          feeBps: 2000,
          feeFixed: 0,
          passOnByDefault: false,
          enabled: true,
          sortOrder: 6,
          notes: null,
        },
      ],
    },
  ],
  [
    /\/suppliers/,
    {
      data: [
        {
          id: 1,
          name: 'Acme Manufacturing',
          matchTag: 'acme',
          matchPriority: 50,
          contactName: null,
          contactEmail: null,
          contactPhone: null,
          currency: 'INR',
          enabled: true,
          notes: null,
          orderCount: 12,
        },
        {
          id: 2,
          name: 'Northwind Traders',
          matchTag: 'sn_trading',
          matchPriority: 10,
          contactName: null,
          contactEmail: null,
          contactPhone: null,
          currency: 'INR',
          enabled: true,
          notes: null,
          orderCount: 3,
        },
        {
          id: 3,
          name: 'Globex Supply',
          matchTag: 'globex',
          matchPriority: 10,
          contactName: null,
          contactEmail: null,
          contactPhone: null,
          currency: 'INR',
          enabled: true,
          notes: null,
          orderCount: 0,
        },
      ],
    },
  ],
  [
    /\/orders\/\d+\/settlement/,
    {
      goodsTotal: 62800,
      fee: 6280,
      invoiceTotal: 62800,
      netReceivable: 56520,
      computedInr: 4719420,
      landedInr: 4719420,
      procurementCostInr: 3100000,
      profitInr: 1619420,
      marginPct: 34.3,
      usingActual: false,
      currency: 'USD',
      feeMode: 'absorb',
      fxRateToInr: 835000,
      paymentMethod: {
        id: 5,
        name: 'PayPal',
        feeBps: 1000,
        feeFixed: 0,
        passOnByDefault: false,
        enabled: true,
        sortOrder: 5,
        notes: null,
      },
      supplier: {
        id: 1,
        name: 'Acme Manufacturing',
        matchTag: 'acme',
        matchPriority: 50,
        contactName: null,
        contactEmail: null,
        contactPhone: null,
        currency: 'INR',
        enabled: true,
        notes: null,
      },
    },
  ],
  // Must precede the generic /orders pattern: FIXTURE_RESPONSES is first-match
  // wins, so without this /orders/1/notifications returns the orders list and
  // the notification panel renders orders as if they were sends.
  [
    /\/orders\/\d+\/notifications/,
    {
      data: [
        {
          id: 1,
          orderId: 1,
          customerId: 1,
          event: 'order_shipped',
          channel: 'email',
          status: 'sent',
          recipient: 'dana@harbor.example',
          subject: 'Order SO2627-0001 has shipped',
          body: null,
          templateName: null,
          error: null,
          sentAt: '2026-08-28T08:05:00Z',
          createdAt: '2026-08-28T08:05:00Z',
        },
        {
          id: 2,
          orderId: 1,
          customerId: 1,
          event: 'order_shipped',
          channel: 'whatsapp',
          status: 'failed',
          recipient: '+14155550101',
          subject: null,
          body: null,
          templateName: 'order_shipped',
          error: 'Campaign does not exist',
          sentAt: null,
          createdAt: '2026-08-28T08:05:00Z',
        },
        {
          id: 3,
          orderId: 1,
          customerId: 1,
          event: 'order_confirmed',
          channel: 'email',
          status: 'sent',
          recipient: 'dana@harbor.example',
          subject: 'Order SO2627-0001 confirmed',
          body: null,
          templateName: null,
          error: null,
          sentAt: '2026-08-24T11:20:00Z',
          createdAt: '2026-08-24T11:20:00Z',
        },
      ],
    },
  ],
  [
    /\/orders\/stats/,
    {
      byStatus: [
        { status: 'confirmed', _count: { id: 1 }, _sum: { total: 20000 } },
        { status: 'shipped', _count: { id: 1 }, _sum: { total: 62800 } },
      ],
      totalRevenue: 82800,
      orderCount: 2,
      openShipments: 1,
    },
  ],
  [/\/orders\/\d+$/, FIXTURE_ORDERS[0]],
  [/\/orders/, { data: FIXTURE_ORDERS, total: 2, page: 1, pages: 1 }],
  [
    /\/customers\/stats/,
    {
      customerCount: 2,
      lifetimeValue: 204500,
      repeatCustomers: 1,
      topCustomers: [
        {
          id: 1,
          name: 'Dana Whitaker',
          company: 'Harbor Supply Co.',
          lifetimeValue: 184500,
          totalOrders: 3,
          currency: 'USD',
        },
      ],
    },
  ],
  [
    /\/customers\/\d+$/,
    {
      ...FIXTURE_CUSTOMERS[0],
      orders: FIXTURE_ORDERS,
      notifications: [
        {
          id: 1,
          orderId: 1,
          customerId: 1,
          event: 'order_shipped',
          channel: 'email',
          status: 'sent',
          recipient: 'dana@harbor.example',
          subject: 'Order SO2627-0001 has shipped',
          body: null,
          templateName: null,
          error: null,
          sentAt: '2026-08-28T08:05:00Z',
          createdAt: '2026-08-28T08:05:00Z',
        },
      ],
      lead: null,
    },
  ],
  [/\/customers/, { data: FIXTURE_CUSTOMERS, total: 2, page: 1, pages: 1 }],
  [
    /\/revenue\/summary/,
    {
      months: [
        { month: '2026-06', total: 41000 },
        { month: '2026-07', total: 58000 },
        { month: '2026-08', total: 62800 },
        { month: '2026-09', total: 20000 },
      ],
      byCountry: [
        { country: 'United States Of America', total: 62800 },
        { country: 'Spain', total: 20000 },
      ],
      bookedTotal: 181800,
      orderCount: 6,
      invoiced: 82800,
      collected: 31400,
      outstanding: 51400,
      unpaidInvoices: [
        {
          id: 1,
          number: 'INV2627-0001',
          total: 62800,
          amountPaid: 31400,
          dueAt: '2026-09-08T00:00:00Z',
          currency: 'USD',
          order: { id: 1, orderNumber: 'SO2627-0001', customerName: 'Dana Whitaker' },
        },
      ],
    },
  ],
  [/\/system\/status/, { connectedAccounts: 2, enabledAccounts: 2 }],
  [/\/system\/health/, { ok: true, services: {} }],
  [/\/alerts\/count/, { count: 3 }],
  [/\/alerts/, []],
  [/\/notifications/, FIXTURE_NOTIFICATIONS],
  [
    /\/stats\/overview/,
    {
      totalLeads: 1392,
      newToday: 34,
      contacted: 1105,
      replied: 252,
      engaged: 88,
      closed: 41,
      pending: 17,
      sentToday: 126,
      waUnavailable: 23,
      scoreDistribution: { hot: 46, warm: 318, cold: 907, new: 121 },
      polling: {},
    },
  ],
  [
    /\/stats\/charts/,
    {
      msgsByDay: daySeries(14, 96, 34),
      statusDist: [
        { status: 'new', _count: { id: 287 } },
        { status: 'contacted', _count: { id: 613 } },
        { status: 'replied', _count: { id: 252 } },
        { status: 'engaged', _count: { id: 88 } },
        { status: 'closed', _count: { id: 41 } },
        { status: 'paused', _count: { id: 111 } },
      ],
      countryDist: [
        { country: 'United States', _count: { id: 412 } },
        { country: 'United Kingdom', _count: { id: 268 } },
        { country: 'Australia', _count: { id: 191 } },
        { country: 'Nigeria', _count: { id: 147 } },
        { country: 'United Arab Emirates', _count: { id: 132 } },
        { country: 'Kenya', _count: { id: 98 } },
        { country: 'Canada', _count: { id: 84 } },
        { country: 'Singapore', _count: { id: 60 } },
      ],
      tierDist: [
        { leadTier: 'HOT', _count: { id: 214 } },
        { leadTier: 'WARM', _count: { id: 566 } },
        { leadTier: 'COLD', _count: { id: 612 } },
      ],
    },
  ],
  [
    /\/analytics\/email-performance/,
    {
      range: '30d',
      totals: { sent: 842, replied: 173, replyRate: 20.5 },
      variants: [
        { variant: 'intro-value-led', sent: 246, replied: 63, replyRate: 25.6 },
        { variant: 'intro-price-led', sent: 219, replied: 47, replyRate: 21.5 },
        { variant: 'followup-short', sent: 188, replied: 34, replyRate: 18.1 },
        { variant: 'followup-case-study', sent: 121, replied: 19, replyRate: 15.7 },
        { variant: 'reactivation', sent: 68, replied: 10, replyRate: 14.7 },
      ],
    },
  ],
  [
    /\/inbox\/channel-health/,
    {
      whatsapp: { status: 'ready', total: 2, detail: '2 numbers connected' },
      imessage: { status: 'limited', total: 1, detail: '1 device relay online' },
      email: { status: 'ready', total: 3, detail: '3 mailboxes sending' },
      telegram: { status: 'ready', total: 1, detail: '1 account connected' },
      inbound: { publicWebhookConfigured: true, detail: 'Webhook receiving' },
    },
  ],
  [
    /\/inbox\/threads\/\d+/,
    {
      ...FIXTURE_THREADS[0],
      messages: FIXTURE_MESSAGES,
      senderAccount: {
        id: 1,
        channel: 'whatsapp',
        name: 'Acme Sales',
        email: null,
        senderName: 'Acme Sales',
        enabled: true,
        status: 'connected',
      },
      availableSenderAccounts: [],
    },
  ],
  [
    /\/inbox\/threads/,
    {
      threads: FIXTURE_THREADS,
      total: FIXTURE_THREADS.length,
      page: 1,
      pages: 1,
      unread: 2,
      needsReply: 3,
    },
  ],
  [/\/inbox\/senders/, []],
  [
    /\/analytics\/daily/,
    daySeries(14, 90, 30).map((d, i) => ({
      label: d.day.slice(5),
      leadsCreated: Math.max(0, 12 + ((i * 5) % 9) - 3),
      msgsSent: d.count,
      replies: Math.max(0, Math.round(d.count * 0.2)),
    })),
  ],
  [
    /\/analytics\/funnel/,
    {
      range: '30d',
      total: 1392,
      paused: 111,
      waUnavailable: 23,
      avgReplyHours: 6.4,
      funnel: [
        {
          stage: 'new',
          label: 'New',
          count: 287,
          cumulative: 1392,
          conversionRate: 100,
          dropoff: 0,
        },
        {
          stage: 'contacted',
          label: 'Contacted',
          count: 613,
          cumulative: 1105,
          conversionRate: 79.4,
          dropoff: 20.6,
        },
        {
          stage: 'replied',
          label: 'Replied',
          count: 252,
          cumulative: 252,
          conversionRate: 22.8,
          dropoff: 77.2,
        },
        {
          stage: 'engaged',
          label: 'Engaged',
          count: 88,
          cumulative: 88,
          conversionRate: 34.9,
          dropoff: 65.1,
        },
        {
          stage: 'closed',
          label: 'Closed',
          count: 41,
          cumulative: 41,
          conversionRate: 46.6,
          dropoff: 53.4,
        },
      ],
    },
  ],
  [
    /\/analytics\/campaign-roi/,
    {
      range: '30d',
      pipeline: { totalDealValue: 4820000, convertedLeads: 41, avgDealValue: 117560 },
      campaigns: [
        {
          id: 1,
          name: 'Q3 export push',
          channel: 'email',
          status: 'completed',
          totalLeads: 420,
          sent: 402,
          replied: 96,
          converted: 18,
          replyRate: 23.9,
          conversionRate: 4.3,
          revenue: 2100000,
          avgDealValue: 116666,
          startedAt: ago(20000),
          completedAt: ago(4000),
        },
        {
          id: 2,
          name: 'Dormant lead reactivation',
          channel: 'whatsapp',
          status: 'active',
          totalLeads: 310,
          sent: 288,
          replied: 74,
          converted: 13,
          replyRate: 25.7,
          conversionRate: 4.2,
          revenue: 1520000,
          avgDealValue: 116923,
          startedAt: ago(9000),
          completedAt: null,
        },
        {
          id: 3,
          name: 'Distributor follow-up',
          channel: 'email',
          status: 'active',
          totalLeads: 205,
          sent: 180,
          replied: 38,
          converted: 10,
          replyRate: 21.1,
          conversionRate: 4.9,
          revenue: 1200000,
          avgDealValue: 120000,
          startedAt: ago(5000),
          completedAt: null,
        },
      ],
    },
  ],
  [
    /\/analytics\/team/,
    [
      {
        id: 3,
        name: 'Priya Sharma',
        email: 'priya@acme.test',
        role: 'agent',
        lastLoginAt: ago(30),
        leadsAssigned: 210,
        replied: 64,
        closed: 18,
        avgScore: 61,
        conversionRate: 8.6,
      },
      {
        id: 4,
        name: 'Arjun Rao',
        email: 'arjun@acme.test',
        role: 'agent',
        lastLoginAt: ago(600),
        leadsAssigned: 188,
        replied: 41,
        closed: 11,
        avgScore: 54,
        conversionRate: 5.9,
      },
    ],
  ],
  [
    /\/email\/templates/,
    // Shape must match EmailTemplate: htmlBody/textBody (not `body`), and
    // `variables` is a JSON *string* the page parses — an array here silently
    // renders "0 variables" on every row.
    [
      {
        id: 1,
        name: 'Intro — value led',
        subject: 'Reliable supply for {{product}}',
        htmlBody:
          '<p>Hi {{name}},</p><p>We manufacture {{product}} at scale and can hold stock against a rolling forecast.</p>',
        textBody:
          'Hi {{name}}, We manufacture {{product}} at scale and can hold stock against a rolling forecast.',
        category: 'intro',
        variables: '["name","product"]',
        createdAt: ago(20000),
        updatedAt: ago(4000),
      },
      {
        id: 2,
        name: 'Quotation follow-up',
        subject: 'Re: your quotation request',
        htmlBody: '<p>Hi {{name}},</p><p>Following up on the quote we sent for {{product}}.</p>',
        textBody: 'Hi {{name}}, Following up on the quote we sent for {{product}}.',
        category: 'followup',
        variables: '["name","product"]',
        createdAt: ago(30000),
        updatedAt: ago(9000),
      },
      {
        id: 3,
        name: 'Reactivation',
        subject: 'Still sourcing {{product}}?',
        htmlBody: '<p>Hi {{name}},</p><p>Checking in on your {{product}} requirement.</p>',
        textBody: 'Hi {{name}}, Checking in on your {{product}} requirement.',
        category: 'reactivation',
        variables: '["name","product"]',
        createdAt: ago(40000),
        updatedAt: ago(12000),
      },
    ],
  ],
  [
    /\/email\/senders/,
    [
      {
        id: 1,
        name: 'Acme Sales',
        email: 'sales@outboundos.space',
        senderName: 'Acme Sales',
        signature: '<p>Acme Health</p>',
        status: 'connected',
        enabled: true,
      },
      {
        id: 2,
        name: 'Exports Desk',
        email: 'exports@outboundos.space',
        senderName: 'Exports Desk',
        signature: null,
        status: 'connected',
        enabled: true,
      },
    ],
  ],
  [
    /\/email\/accounts/,
    [
      {
        id: 1,
        name: 'Acme Sales',
        email: 'sales@outboundos.space',
        status: 'connected',
        enabled: true,
      },
      {
        id: 2,
        name: 'Exports Desk',
        email: 'exports@outboundos.space',
        status: 'connected',
        enabled: true,
      },
    ],
  ],
  [
    /\/campaigns/,
    // Field names must match the Campaign type: sentCount / replyCount /
    // failedCount, and status 'running' (not 'active'). Guessing these renders
    // a table of zeroes that looks like a page bug.
    {
      campaigns: [
        {
          id: 1,
          name: 'Q3 export push',
          description: null,
          channel: 'email',
          messageTemplate: '',
          emailSubject: 'Reliable supply',
          emailTemplateId: 1,
          senderAccountId: 1,
          status: 'completed',
          targetFilter: null,
          variantBTemplate: null,
          variantBSubject: null,
          variantACount: 402,
          variantBCount: 0,
          variantAReplies: 96,
          variantBReplies: 0,
          totalLeads: 420,
          sentCount: 402,
          failedCount: 4,
          replyCount: 96,
          scheduledAt: null,
          startedAt: ago(20000),
          completedAt: ago(4000),
          createdAt: ago(20000),
          updatedAt: ago(4000),
        },
        {
          id: 2,
          name: 'Dormant lead reactivation',
          description: null,
          channel: 'whatsapp',
          messageTemplate: '',
          emailSubject: null,
          emailTemplateId: null,
          senderAccountId: null,
          status: 'running',
          targetFilter: null,
          variantBTemplate: null,
          variantBSubject: null,
          variantACount: 288,
          variantBCount: 0,
          variantAReplies: 74,
          variantBReplies: 0,
          totalLeads: 310,
          sentCount: 288,
          failedCount: 2,
          replyCount: 74,
          scheduledAt: null,
          startedAt: ago(9000),
          completedAt: null,
          createdAt: ago(9000),
          updatedAt: ago(60),
        },
        {
          id: 3,
          name: 'Distributor follow-up',
          description: null,
          channel: 'email',
          messageTemplate: '',
          emailSubject: 'Following up',
          emailTemplateId: 2,
          senderAccountId: 1,
          status: 'scheduled',
          targetFilter: null,
          variantBTemplate: null,
          variantBSubject: null,
          variantACount: 0,
          variantBCount: 0,
          variantAReplies: 0,
          variantBReplies: 0,
          totalLeads: 205,
          sentCount: 0,
          failedCount: 0,
          replyCount: 0,
          scheduledAt: ago(-3600),
          startedAt: null,
          completedAt: null,
          createdAt: ago(600),
          updatedAt: ago(600),
        },
        {
          id: 4,
          name: 'New product launch',
          description: null,
          channel: 'whatsapp',
          messageTemplate: '',
          emailSubject: null,
          emailTemplateId: null,
          senderAccountId: null,
          status: 'draft',
          targetFilter: null,
          variantBTemplate: null,
          variantBSubject: null,
          variantACount: 0,
          variantBCount: 0,
          variantAReplies: 0,
          variantBReplies: 0,
          totalLeads: 0,
          sentCount: 0,
          failedCount: 0,
          replyCount: 0,
          scheduledAt: null,
          startedAt: null,
          completedAt: null,
          createdAt: ago(120),
          updatedAt: ago(120),
        },
      ],
      total: 4,
      page: 1,
      pages: 1,
    },
  ],

  // The API returns `leads`; leadsApi maps it to `data` for the page.
  // Honours ?status= so the Pipeline board (one request per stage) does not
  // show the same rows in every column.
  [
    /\/leads\?|\/leads$/,
    (url: string) => {
      const status = new URL(url, location.origin).searchParams.get('status')
      const leads = status ? FIXTURE_LEADS.filter((l) => l.status === status) : FIXTURE_LEADS
      return { leads, total: leads.length, page: 1, pages: 1 }
    },
  ],
  [
    /\/leads\/\d+\/notes/,
    [
      {
        id: 1,
        leadId: 1,
        type: 'call',
        content:
          'Called to confirm the enquiry. Wants boxed packs, 20k units, first shipment before end of quarter.',
        createdAt: new Date(Date.now() - 86_400_000).toISOString(),
      },
      {
        id: 2,
        leadId: 1,
        type: 'note',
        content: 'Price sensitive — competitor quoted 8% lower but on a 60-day lead time.',
        createdAt: new Date(Date.now() - 3 * 86_400_000).toISOString(),
      },
    ],
  ],
  [
    /\/leads\/\d+\/tasks/,
    [
      {
        id: 1,
        leadId: 1,
        title: 'Send updated price list with MOQ tiers',
        dueAt: new Date(Date.now() + 86_400_000).toISOString(),
        done: false,
        createdAt: new Date(Date.now() - 3600_000).toISOString(),
      },
      {
        id: 2,
        leadId: 1,
        title: 'Confirm COA availability with production',
        dueAt: null,
        done: false,
        createdAt: new Date(Date.now() - 7200_000).toISOString(),
      },
      {
        id: 3,
        leadId: 1,
        title: 'Share company profile deck',
        dueAt: null,
        done: true,
        createdAt: new Date(Date.now() - 4 * 86_400_000).toISOString(),
      },
    ],
  ],
  [
    /\/leads\/\d+$/,
    (url: string) => {
      const id = Number(url.match(/\/leads\/(\d+)/)?.[1] ?? 1)
      const found = FIXTURE_LEADS.find((l) => l.id === id)
      return found ? { ...found, assignedTo: { id: 3, name: 'Priya Sharma' } } : FIXTURE_LEADS[0]
    },
  ],
  [/\/stats\/activity/, []],
]

function installFixtureFetch() {
  const original = window.fetch.bind(window)
  window.fetch = async (input: RequestInfo | URL, init?: RequestInit) => {
    const url = typeof input === 'string' ? input : input instanceof URL ? input.href : input.url
    if (!url.includes('/api/')) return original(input, init)

    const match = FIXTURE_RESPONSES.find(([pattern]) => pattern.test(url))
    const raw = match ? match[1] : {}
    const body = typeof raw === 'function' ? (raw as (u: string) => unknown)(url) : raw
    return new Response(JSON.stringify(body), {
      status: 200,
      headers: { 'Content-Type': 'application/json' },
    })
  }
}

/**
 * Keep the notification bell populated.
 *
 * `useDashboardNotifications` clears the store on mount and only refills it
 * from `/notifications` when a JWT is present — which it never is here, and
 * seeding it with a fake one sends the app's auth check to /login before the
 * fixture fetch above is even installed. So instead: refill the store whenever
 * it empties, which covers both the mount-time reset and `clear()`.
 */
function seedNotifications() {
  const fill = () => notificationActions.hydrateFromActivity(FIXTURE_NOTIFICATIONS)
  useNotificationStore.subscribe((state) => {
    if (state.items.length === 0) fill()
  })
  fill()
}

function seedStores() {
  useAuthStore.setState({
    user: {
      id: 0,
      name: 'Preview User',
      email: 'preview@localhost',
      role: 'admin',
      enabled: true,
      lastLoginAt: null,
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
    },
    capabilities: {},
    isAuthenticated: true,
    isLoading: false,
  })
}

// Seeded at module scope, not during render: calling store setters while
// DevShellPage was rendering made React warn about updating another component
// mid-render. This still runs before the shell mounts, which is what matters.
let seeded = false
if (!seeded) {
  seeded = true
  installFixtureFetch()
  seedStores()
  // `?empty=1` skips the notification seed, so the bell's empty state can be
  // reviewed without editing this file.
  if (!window.location.search.includes('empty')) seedNotifications()
}

export default function DevShellPage() {
  return <AppShell />
}
