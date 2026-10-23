import type { ConnectorReceipt, WebhookSource } from '@/api/endpoints/connectors'

// This interactive preview is memory-only and never imports or sends real data.
let nextId = 5
const sources: WebhookSource[] = [
  ['Website contact form', 'website', 612, null, ''],
  ['Facebook Lead Ads', 'facebook-ads', 238, null, ''],
  ['Trade show enquiries', 'trade-show', 141, null, ''],
  ['Partner history', 'partner-history', 3, 1, 'partner-import'],
].map(([name, source, totalReceived, importSupplierId, importTags], index) => ({
  id: index + 1,
  name: String(name),
  source: String(source),
  totalReceived: Number(totalReceived),
  importSupplierId: importSupplierId == null ? null : Number(importSupplierId),
  importTags: String(importTags),
  enabled: true,
  lastReceivedAt: '2026-10-20T12:00:00Z',
  createdAt: '2026-06-10T09:00:00Z',
}))
const receipts: Array<ConnectorReceipt & { sourceId: number }> = [
  {
    id: 1,
    sourceId: 4,
    externalId: 'sample-enquiry-001',
    state: 'conflict',
    leadId: null,
    reason: 'Existing supplier attribution differs.',
    recordJson: JSON.stringify({
      name: 'Example Buyer',
      email: 'buyer@example.test',
      product: 'Replacement parts',
      acquiredAt: '2026-06-01T12:00:00Z',
    }),
    createdAt: '2026-10-20T12:00:00Z',
  },
  {
    id: 2,
    sourceId: 4,
    externalId: 'sample-enquiry-002',
    state: 'created',
    leadId: 1,
    reason: null,
    recordJson: JSON.stringify({
      name: 'Sample Contact',
      email: 'contact@example.test',
      company: 'Example Team',
      product: 'Wholesale enquiry',
    }),
    createdAt: '2026-10-20T12:00:00Z',
  },
  {
    id: 3,
    sourceId: 4,
    externalId: 'sample-enquiry-003',
    state: 'matched',
    leadId: 2,
    reason: null,
    recordJson: JSON.stringify({
      name: 'Sample Distributor',
      email: 'distributor@example.test',
      product: 'Catalogue request',
    }),
    createdAt: '2026-10-20T12:00:00Z',
  },
]
const json = (body: unknown, status = 200) =>
  new Response(JSON.stringify(body), { status, headers: { 'Content-Type': 'application/json' } })

export function handleConnectorRequest(url: string, init?: RequestInit): Response | null {
  const path = new URL(url, location.origin)
  if (
    !/^\/api\/(webhooks\/sources(?:\/|$)|connector-sources\/|connector-receipts$)/.test(
      path.pathname,
    )
  )
    return null
  const method = (init?.method || 'GET').toUpperCase()
  const body = init?.body && typeof init.body === 'string' ? JSON.parse(init.body) : {}
  if (path.pathname === '/api/connector-receipts' && method === 'GET') {
    const selected = receipts.filter(
      (receipt) =>
        receipt.sourceId === Number(path.searchParams.get('sourceId')) &&
        (!path.searchParams.get('state') || receipt.state === path.searchParams.get('state')),
    )
    const page = Math.max(1, Number(path.searchParams.get('page')) || 1)
    return json({
      records: selected.slice((page - 1) * 100, page * 100),
      total: selected.length,
      page,
      pages: Math.ceil(selected.length / 100),
    })
  }
  if (path.pathname === '/api/webhooks/sources/presets') return json([])
  if (path.pathname === '/api/webhooks/sources') {
    if (method === 'GET') return json(sources)
    if (method === 'POST') {
      const slug = String(body.source || '')
        .toLowerCase()
        .replace(/[^a-z0-9-]/g, '-')
      if (sources.some((source) => source.source === slug))
        return json({ error: 'Source slug already exists' }, 409)
      const source: WebhookSource = {
        id: nextId++,
        name: String(body.name),
        source: slug,
        enabled: true,
        totalReceived: 0,
        lastReceivedAt: null,
        createdAt: new Date().toISOString(),
        importSupplierId: null,
        importTags: '',
      }
      sources.push(source)
      return json({ ...source, apiKey: 'demo-only-source-key-do-not-use-in-production' })
    }
  }
  const id = Number(path.pathname.split('/').slice(-1)[0])
  const source = sources.find((entry) => entry.id === id)
  if (!source) return json({ error: 'Source not found.' }, 404)
  if (method === 'PATCH') {
    if (path.pathname.startsWith('/api/connector-sources/')) {
      source.importSupplierId = Number(body.supplierId)
      source.importTags = Array.isArray(body.tags) ? body.tags.join(', ') : ''
      return json({
        sourceId: id,
        supplierId: source.importSupplierId,
        tags: body.tags,
        outreachQueued: false,
      })
    }
    if (typeof body.enabled === 'boolean') source.enabled = body.enabled
    return json(source)
  }
  if (method === 'DELETE') {
    if (receipts.some((receipt) => receipt.sourceId === id))
      return json(
        { error: 'This source has import records. Disable it instead to preserve its history.' },
        409,
      )
    sources.splice(sources.indexOf(source), 1)
    return json({ ok: true })
  }
  return json({ error: 'Unsupported preview action.' }, 405)
}
