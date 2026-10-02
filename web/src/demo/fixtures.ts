import { ROLE_PAGE_CAPABILITIES } from '@/lib/role-shell'
import { useAuthStore } from '@/stores/auth-store'
import { notificationActions, useNotificationStore } from '@/stores/notification-store'
import type { ActivityLog } from '@/api/types'
import { toast } from '@/stores/toast-store'
import { handleInboxRequest } from './inbox'

/**
 * Sample data for the dashboard without a backend: a workspace called Acme
 * Supplies with leads, conversations, orders and campaigns.
 *
 * Two places use it. The dev preview (/dev/shell, development builds only)
 * renders the real `AppShell` with it so the chrome can be reviewed without a
 * login, and the public demo (a `--mode demo` build, demo.outboundos.space)
 * renders the whole app with it. Either way the components are the shipping
 * ones, fed by fixtures instead of the API.
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
function overviewDays(url: string) {
  const days = Number(new URL(url, location.origin).searchParams.get('days'))
  return [7, 14, 30].includes(days) ? days : 14
}

function overviewMessageSeries(days: number) {
  return daySeries(days, 96, 34).map((row, index) => {
    const whatsapp = Math.round(row.count * 0.48)
    const email = Math.round(row.count * 0.31)
    const imessage = Math.round(row.count * 0.13)
    const telegram = row.count - whatsapp - email - imessage
    return {
      ...row,
      whatsapp,
      email,
      imessage,
      telegram,
      other: 0,
      previousTotal: Math.max(0, row.count - 8 + (index % 5) * 3),
      newLeads: Math.round(row.count * 0.08),
      contactedLeads: Math.round(row.count * 0.06),
      repliedLeads: Math.round(row.count * 0.023),
    }
  })
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
    mobile: 'no-phone:IN.DEMO000001',
    waUsername: 'rohan_supplies',
    waUserId: 'IN.DEMO000001',
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

/* The rest of the sample pipeline: enough leads that every stage, tier,
   source and a spread of countries show up, sized like a small team's week. */
const MORE_LEADS: Array<
  [string, string, string, string, string, string, string, string, number, string, boolean]
> = [
  // name, company, country, product, quantity, status, tier, source, score, email, onWhatsApp
  [
    'Priya Nair',
    'Kerala Hardware Traders',
    'India',
    'M10 hex bolts',
    '50,000 pcs / month',
    'new',
    'HOT',
    'telegram',
    71,
    'priya@kerala-traders.example',
    true,
  ],
  [
    'Tomas Berg',
    'Nordic Build AB',
    'Sweden',
    'Anchor bolts M12',
    '8,000 units',
    'closed',
    'WARM',
    'website',
    64,
    'tomas@nordic.example',
    true,
  ],
  [
    'Amara Diallo',
    'Sahel Construction',
    'Senegal',
    'Galvanised washers',
    '100,000 pcs',
    'new',
    'WARM',
    'facebook_ads',
    58,
    'amara@sahel.example',
    true,
  ],
  [
    'Lucas Ferreira',
    'Porto Industrial',
    'Portugal',
    'Cable ties 300mm',
    '2,000 boxes',
    'new',
    'COLD',
    'website',
    32,
    'lucas@porto-ind.example',
    true,
  ],
  [
    'Mei Lin Tan',
    'Straits Electrical',
    'Singapore',
    'LED panel lights',
    '1,200 boxes',
    'contacted',
    'WARM',
    'zapier',
    61,
    'meilin@straits.example',
    true,
  ],
  [
    'Ahmed Al-Farsi',
    'Gulf Fasteners LLC',
    'United Arab Emirates',
    'Stainless hex bolts M8',
    '30,000 units',
    'engaged',
    'HOT',
    'indiamart',
    88,
    'ahmed@gulf-fasteners.example',
    true,
  ],
  [
    'Emily Carter',
    'Brightline Retail',
    'United States',
    'LED panel lights 600x600',
    '3,000 boxes',
    'contacted',
    'COLD',
    'csv_import',
    29,
    'emily@brightline.example',
    false,
  ],
  [
    'Kwame Mensah',
    'Accra Build Supply',
    'Ghana',
    'Cotton work gloves',
    '20,000 pairs',
    'replied',
    'HOT',
    'website',
    79,
    'kwame@accra-build.example',
    true,
  ],
  [
    'Sofia Rossi',
    'Milano Impianti',
    'Italy',
    'Cable glands',
    '5,000 pcs',
    'engaged',
    'WARM',
    'website',
    67,
    'sofia@milano-impianti.example',
    true,
  ],
  [
    'Arjun Kapoor',
    'Delhi Hardware Mart',
    'India',
    'Self-tapping screws',
    '200,000 pcs',
    'contacted',
    'WARM',
    'indiamart',
    55,
    'arjun@dhm.example',
    true,
  ],
  [
    'Hannah Schmidt',
    'Rhein Technik GmbH',
    'Germany',
    'DIN 933 bolts',
    '15,000 units',
    'replied',
    'HOT',
    'webhook',
    83,
    'h.schmidt@rhein-technik.example',
    false,
  ],
  [
    'Diego Morales',
    'Andes Minería',
    'Chile',
    'Safety gloves',
    '6,000 pairs',
    'wa_unavailable',
    'COLD',
    'csv_import',
    22,
    'diego@andes.example',
    false,
  ],
  [
    'Fatima Zahra',
    'Casablanca Trading',
    'Morocco',
    'Galvanised washers',
    '40,000 pcs',
    'contacted',
    'WARM',
    'facebook_ads',
    49,
    'fatima@casa-trading.example',
    true,
  ],
  [
    'Oliver Grant',
    'Grant & Sons Builders',
    'United Kingdom',
    'Anchor bolts M12',
    '2,500 units',
    'paused',
    'COLD',
    'website',
    18,
    'oliver@grantsons.example',
    true,
  ],
  [
    'Nguyen Van An',
    'Saigon Electric',
    'Vietnam',
    'Cable ties 200mm',
    '4,000 boxes',
    'new',
    'WARM',
    'zapier',
    52,
    'an@saigon-electric.example',
    true,
  ],
  [
    'Chloe Martin',
    'Lyon Distribution',
    'France',
    'LED panel lights',
    '900 boxes',
    'engaged',
    'HOT',
    'website',
    74,
    'chloe@lyon-distri.example',
    true,
  ],
  [
    'Rahul Verma',
    'Pune Engineering Works',
    'India',
    'Hex nuts M8',
    '80,000 pcs',
    'closed',
    'HOT',
    'indiamart',
    91,
    'rahul@pune-eng.example',
    true,
  ],
  [
    'Isabella Costa',
    'São Paulo Ferragens',
    'Brazil',
    'Stainless screws',
    '60,000 pcs',
    'contacted',
    'COLD',
    'website',
    35,
    'isabella@spferragens.example',
    true,
  ],
  [
    'Yusuf Demir',
    'Anatolia Yapı',
    'Turkey',
    'Anchor bolts',
    '10,000 units',
    'new',
    'HOT',
    'facebook_ads',
    69,
    'yusuf@anatolia.example',
    true,
  ],
  [
    'Grace Wanjiru',
    'Nairobi Supplies Co',
    'Kenya',
    'Cotton work gloves',
    '15,000 pairs',
    'replied',
    'WARM',
    'website',
    63,
    'grace@nairobi-supplies.example',
    true,
  ],
  [
    'Jack Thompson',
    'Southern Cross Hardware',
    'Australia',
    'Cable glands',
    '3,500 pcs',
    'contacted',
    'WARM',
    'webhook',
    47,
    'jack@southerncross.example',
    false,
  ],
]
const DIAL: Record<string, string> = {
  India: '91',
  Sweden: '46',
  Senegal: '221',
  Portugal: '351',
  Singapore: '65',
  'United Arab Emirates': '971',
  'United States': '1',
  Ghana: '233',
  Italy: '39',
  Germany: '49',
  Chile: '56',
  Morocco: '212',
  'United Kingdom': '44',
  Vietnam: '84',
  France: '33',
  Brazil: '55',
  Turkey: '90',
  Kenya: '254',
  Australia: '61',
}
MORE_LEADS.forEach(
  (
    [
      name,
      company,
      country,
      product,
      quantity,
      status,
      leadTier,
      source,
      score,
      email,
      isOnWhatsApp,
    ],
    index,
  ) => {
    const created = 300 + index * 410
    FIXTURE_LEADS.push({
      id: index + 4,
      name,
      company,
      mobile: `+${DIAL[country] ?? '1'} 000 000 ${String(index + 10).padStart(4, '0')}`,
      email,
      country,
      product,
      quantity,
      status,
      leadTier,
      score,
      source,
      isOnWhatsApp,
      followupCount: status === 'new' ? 0 : (index % 3) + 1,
      assignedTo: null,
      createdAt: ago(created),
      lastMessageAt: status === 'new' ? null : ago(created - 120),
    } as (typeof FIXTURE_LEADS)[number])
  },
)

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
    message: 'sales@acme.example could not be synced: IMAP authentication rejected.',
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
  /* Settings, team and integrations: the calls that, unanswered, left those
     pages empty or crashing in the demo. */
  [
    /\/whatsapp\/accounts(\?|$)/,
    [
      {
        id: 1,
        name: 'Acme Sales',
        phone: '+44 20 0000 0001',
        status: 'connected',
        waAccountType: 'cloud_api',
        enabled: true,
        autoSleep: true,
        personaName: 'Maya',
        personaGender: 'female',
        personaTitle: 'Sales Manager',
        companyName: 'Acme Supplies',
        companyCity: 'London',
        companyIndustry: 'Industrial fasteners',
        companyCerts: 'ISO 9001',
        companyUSP: 'Stock ships in 48 hours',
        hourlyLimit: 60,
        dailyLimit: 250,
        maxFollowups: 3,
        followupDelays: '1,2,3',
        messagesSentToday: 84,
        provider: 'meta',
        providerLabel: 'Meta Cloud API',
        sessionReady: true,
        templatesReady: true,
        templateLanguage: 'en',
        metaWabaId: '100000000000001',
        metaPhoneNumberId: '100000000000011',
        metaConfigured: true,
        aisensyProjectId: '',
        projectApiConfigured: false,
        campaignApiConfigured: false,
        defaultCampaignName: '',
        lastResetAt: ago(600),
        createdAt: '2026-06-02T09:00:00Z',
      },
      {
        id: 2,
        name: 'Exports Desk',
        phone: '+44 20 0000 0002',
        status: 'connected',
        waAccountType: 'cloud_api',
        enabled: true,
        autoSleep: true,
        personaName: 'Daniel',
        personaGender: 'male',
        personaTitle: 'Export Coordinator',
        companyName: 'Acme Supplies',
        companyCity: 'London',
        companyIndustry: 'Industrial fasteners',
        companyCerts: 'ISO 9001',
        companyUSP: 'Stock ships in 48 hours',
        hourlyLimit: 40,
        dailyLimit: 150,
        maxFollowups: 3,
        followupDelays: '1,2,3',
        messagesSentToday: 42,
        provider: 'meta',
        providerLabel: 'Meta Cloud API',
        sessionReady: true,
        templatesReady: true,
        templateLanguage: 'en',
        metaWabaId: '100000000000001',
        metaPhoneNumberId: '100000000000012',
        metaConfigured: true,
        aisensyProjectId: '',
        projectApiConfigured: false,
        campaignApiConfigured: false,
        defaultCampaignName: '',
        lastResetAt: ago(600),
        createdAt: '2026-07-14T09:00:00Z',
      },
    ],
  ],
  [
    /\/api\/users$/,
    [
      ['Maya Collins', 'maya@acme.example', 'admin', 12],
      ['Priya Sharma', 'priya@acme.example', 'manager', 95],
      ['Daniel Brooks', 'daniel@acme.example', 'agent', 30],
      ['Leo Novak', 'leo@acme.example', 'agent', 2900],
      ['Finance', 'finance@acme.example', 'viewer', 8600],
    ].map(([name, email, role, minutes], index) => ({
      id: index + 1,
      name,
      email,
      role,
      enabled: true,
      lastLoginAt: ago(minutes as number),
      createdAt: '2026-06-01T09:00:00Z',
      updatedAt: '2026-09-01T09:00:00Z',
    })),
  ],
  [
    /\/team\/invitations/,
    [
      {
        id: 'inv-1',
        email: 'sam@acme.example',
        role: 'agent',
        expiresAt: new Date(Date.now() + 5 * 86_400_000).toISOString(),
        createdAt: ago(2 * 1440),
        expired: false,
      },
    ],
  ],
  [
    /\/workspace\/profile/,
    {
      DASHBOARD_BRAND_NAME: 'Acme Sales',
      BUSINESS_NAME: 'Acme Supplies',
      BUSINESS_CITY: 'London',
      BUSINESS_COUNTRY: 'United Kingdom',
      BUSINESS_INDUSTRY: 'Industrial fasteners and electrical supplies',
      BUSINESS_CERTIFICATIONS: 'ISO 9001',
      BUSINESS_TIMEZONE: 'Europe/London',
      DEFAULT_COUNTRY_CODE: '44',
      BUSINESS_CURRENCY: 'USD',
      BUSINESS_WEBSITE: 'https://acme.example',
      BUSINESS_CATALOGUE_URL: 'https://acme.example/catalogue',
      BUSINESS_WHATSAPP_NUMBER: '+44 20 0000 0001',
      BUSINESS_TAGLINE: 'Fasteners and electrical supplies, shipped in 48 hours',
      AI_PERSONA_NAME: 'Maya',
      AI_PERSONA_GENDER: 'female',
      AI_PERSONA_TITLE: 'Sales Manager',
      EMAIL_SIGNATURE_NAME: 'Maya Collins',
      EMAIL_FOOTER_NOTE: 'Acme Supplies Ltd · London',
    },
  ],
  [
    /\/api\/config$/,
    { waMaxMessages: 250, waWarmupMode: false, WA_MIN_DELAY: 30, WA_MAX_DELAY: 90 },
  ],
  [
    /\/email\/daily\/status/,
    {
      enabled: true,
      batchSize: 100,
      senderIds: [1, 2],
      perSenderQuota: 50,
      deliveryMode: 'smtp',
      marketing: {
        enabled: false,
        globallyPaused: false,
        configuredBrevoSenders: false,
        folderId: null,
        folderConfigured: false,
        webhookConfigured: false,
        webhookUrl: null,
        consentedCount: 0,
        ready: false,
      },
      lastRunDate: new Date().toISOString().slice(0, 10),
      lastRunAt: ago(420),
      lastQueued: 96,
      eligibleCount: 214,
      consentedCount: 0,
      blockedNoConsentCount: 0,
      schedule: 'Weekdays at 10:00',
      accounts: [
        {
          id: 1,
          email: 'sales@acme.example',
          provider: 'gmail',
          status: 'verified',
          lastError: null,
          dailyLimit: 150,
          sentToday: 61,
        },
        {
          id: 2,
          email: 'exports@acme.example',
          provider: 'smtp',
          status: 'verified',
          lastError: null,
          dailyLimit: 100,
          sentToday: 35,
        },
      ],
    },
  ],
  [
    /\/imessage\/accounts/,
    [
      {
        id: 1,
        name: 'Sales Mac',
        serverUrl: 'https://mac.acme.example',
        appleId: 'sales@acme.example',
        enabled: true,
        status: 'online',
        lastPingAt: ago(1),
        hourlyLimit: 30,
        dailyLimit: 120,
        sentToday: 18,
        lastResetAt: ago(600),
        createdAt: '2026-07-01T09:00:00Z',
        updatedAt: ago(1),
      },
    ],
  ],
  [
    /\/telegram\/accounts/,
    [
      {
        id: 1,
        name: 'Sales Telegram',
        apiId: 1000001,
        phoneNumber: '+44 20 0000 0003',
        username: 'acme_sales',
        displayName: 'Acme Sales',
        enabled: true,
        manualOnly: true,
        status: 'connected',
        lastError: null,
        lastConnectedAt: ago(30),
        dailyLimit: 50,
        sentToday: 4,
        hasCredentials: true,
        hasSession: true,
      },
    ],
  ],
  [
    /\/webhooks\/sources/,
    [
      ['Website contact form', 'website', 612, 12],
      ['Facebook Lead Ads', 'facebook_ads', 238, 95],
      ['Zapier: trade show list', 'zapier', 141, 2880],
      ['IndiaMART', 'indiamart', 401, 40],
    ].map(([name, source, total, minutes], index) => ({
      id: index + 1,
      name,
      source,
      apiKey: 'demo-key-hidden',
      fieldMap: '{}',
      enabled: true,
      lastReceivedAt: ago(minutes as number),
      totalReceived: total,
      createdAt: '2026-06-10T09:00:00Z',
    })),
  ],
  [
    /\/settings\/sheets-webhook/,
    {
      url: 'https://script.google.com/macros/s/demo/exec',
      enabled: true,
      lastSyncAt: ago(8),
      totalSynced: 1188,
      events: ['lead.created', 'lead.replied', 'lead.engaged'],
    },
  ],
  [
    /\/import\/batches/,
    [
      {
        id: 3,
        filename: 'distributors-q3.csv',
        totalRows: 246,
        imported: 240,
        duplicates: 4,
        failed: 2,
        status: 'completed',
        createdAt: ago(320),
      },
      {
        id: 2,
        filename: 'trade-show-dubai.csv',
        totalRows: 88,
        imported: 81,
        duplicates: 7,
        failed: 0,
        status: 'completed',
        createdAt: ago(9 * 1440),
      },
      {
        id: 1,
        filename: 'old-crm-export.csv',
        totalRows: 1034,
        imported: 978,
        duplicates: 49,
        failed: 7,
        status: 'completed',
        createdAt: ago(40 * 1440),
      },
    ],
  ],
  [
    /\/leads\/tags/,
    {
      tags: [
        { tag: 'distributor', count: 412 },
        { tag: 'trade-show', count: 81 },
        { tag: 'repeat-buyer', count: 64 },
        { tag: 'export', count: 203 },
      ],
    },
  ],
  [
    /\/auth\/me$/,
    { user: { sub: 1, name: 'Maya Collins', email: 'maya@acme.example', role: 'admin' } },
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
    (url: string) => {
      const days = overviewDays(url)
      return {
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
        period: {
          days,
          current: {
            newLeads: Math.round(days * 8.4),
            messagesSent: overviewMessageSeries(days).reduce((sum, row) => sum + row.count, 0),
            contactedLeads: Math.round(days * 6.1),
            repliedLeads: Math.round(days * 2.3),
          },
          previous: {
            newLeads: Math.round(days * 7.8),
            messagesSent: overviewMessageSeries(days).reduce(
              (sum, row) => sum + row.previousTotal,
              0,
            ),
            contactedLeads: Math.round(days * 5.7),
            repliedLeads: Math.round(days * 2.0),
          },
        },
        polling: {},
      }
    },
  ],
  [
    /\/stats\/charts/,
    (url: string) => ({
      msgsByDay: overviewMessageSeries(overviewDays(url)),
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
    }),
  ],
  [
    /\/analytics\/email-performance/,
    (url: string) => {
      const range = new URL(url, location.origin).searchParams.get('range') ?? '30d'
      const factor = range === '7d' ? 0.25 : range === '14d' ? 0.48 : 1
      const variants = [
        { variant: 'intro-value-led', sent: 246, replied: 63, replyRate: 25.6 },
        { variant: 'intro-price-led', sent: 219, replied: 47, replyRate: 21.5 },
        { variant: 'followup-short', sent: 188, replied: 34, replyRate: 18.1 },
        { variant: 'followup-case-study', sent: 121, replied: 19, replyRate: 15.7 },
        { variant: 'reactivation', sent: 68, replied: 10, replyRate: 14.7 },
      ].map((row) => {
        const sent = Math.round(row.sent * factor)
        const replied = Math.round(row.replied * factor)
        return {
          ...row,
          sent,
          replied,
          replyRate: sent ? Math.round((replied / sent) * 1000) / 10 : 0,
        }
      })
      const sent = variants.reduce((sum, row) => sum + row.sent, 0)
      const replied = variants.reduce((sum, row) => sum + row.replied, 0)
      return {
        range,
        totals: { sent, replied, replyRate: sent ? Math.round((replied / sent) * 1000) / 10 : 0 },
        variants,
      }
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
        email: 'sales@acme.example',
        senderName: 'Acme Sales',
        signature: '<p>Acme Health</p>',
        status: 'connected',
        enabled: true,
      },
      {
        id: 2,
        name: 'Exports Desk',
        email: 'exports@acme.example',
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
        email: 'sales@acme.example',
        status: 'connected',
        enabled: true,
      },
      {
        id: 2,
        name: 'Exports Desk',
        email: 'exports@acme.example',
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
  [
    /\/onboarding\/status/,
    {
      dismissed: true,
      complete: true,
      steps: { profile: true, channel: true, leadSource: true, team: true },
      channels: { whatsapp: true, email: true, telegram: false, imessage: false },
      counts: { leadSources: 2, leads: 5, users: 3, outgoingWebhooks: 1 },
      integrations: { googleSheets: true, outgoingWebhooks: true, mcp: true },
      profile: { BUSINESS_NAME: 'Acme Supplies', BUSINESS_TIMEZONE: 'Europe/London' },
    },
  ],
  [
    /\/config\/brand/,
    {
      brandName: 'Outbound OS',
      businessName: 'Acme Supplies',
      currency: 'USD',
      timezone: 'Europe/London',
    },
  ],
  [
    /\/analytics\/whatsapp-pricing/,
    {
      since: '2026-09-01T00:00:00.000Z',
      timeZone: 'Europe/London',
      categories: [
        { category: 'marketing', billable: 412, free: 0 },
        { category: 'utility', billable: 96, free: 38 },
        { category: 'service', billable: 0, free: 281 },
      ],
      billable: 508,
      free: 319,
      unpriced: 12,
    },
  ],
]

/* Changes the demo cannot make. Everything else that writes is answered with
   this, so the page shows why nothing happened instead of pretending it
   worked. */
const DEMO_WRITE_NOTICE = {
  error:
    'This is a demo, so changes are not saved. Install Outbound OS to use it with your own leads.',
  code: 'demo_read_only',
}

/* Writes the app makes on its own (marking things read, remembering layout)
   succeed quietly: an error for something the visitor did not do is noise. */
const QUIET_WRITES = [
  /\/read$/,
  /\/read-all$/,
  /\/mark-read/,
  /\/notifications/,
  /\/seen/,
  /\/preferences/,
]

export function installFixtureFetch() {
  const original = window.fetch.bind(window)
  window.fetch = async (input: RequestInfo | URL, init?: RequestInit) => {
    const url = typeof input === 'string' ? input : input instanceof URL ? input.href : input.url
    if (!url.includes('/api/')) return original(input, init)

    const inbox = await handleInboxRequest(url, init)
    if (inbox) return inbox

    const method = (init?.method || 'GET').toUpperCase()
    if (method !== 'GET' && method !== 'HEAD') {
      const quiet = QUIET_WRITES.some((pattern) => pattern.test(url.split('?')[0]))
      // Said here rather than left to each page, because some pages save
      // without reporting a failure; the toast store drops the repeats.
      if (!quiet) toast.info(DEMO_WRITE_NOTICE.error)
      return new Response(JSON.stringify(quiet ? { ok: true } : DEMO_WRITE_NOTICE), {
        status: quiet ? 200 : 403,
        headers: { 'Content-Type': 'application/json' },
      })
    }

    const match = FIXTURE_RESPONSES.find(([pattern]) => pattern.test(url))
    // Listed in the console so a page that renders empty can be traced to
    // the call with no sample data behind it.
    if (!match) console.debug('[demo] no sample data for', url)
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
export function seedNotifications() {
  const fill = () => notificationActions.hydrateFromActivity(FIXTURE_NOTIFICATIONS)
  useNotificationStore.subscribe((state) => {
    if (state.items.length === 0) fill()
  })
  fill()
}

export function seedStores() {
  useAuthStore.setState({
    user: {
      id: 1,
      name: 'Maya Collins',
      email: 'maya@acme.example',
      role: 'admin',
      enabled: true,
      lastLoginAt: null,
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
    },
    capabilities: Object.fromEntries(ROLE_PAGE_CAPABILITIES.admin.map((c) => [c, true])),
    isAuthenticated: true,
    isLoading: false,
  })
}
