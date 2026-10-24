// Retained mail examples use fictional addresses and never contact a server.
const exampleFile = 'Sample specification for a wholesale enquiry. Demonstration data only.\n'
const attachment = {
  index: 0,
  filename: 'sample-specification.txt',
  contentType: 'text/plain',
  size: new TextEncoder().encode(exampleFile).length,
}
const examples = [
  {
    id: 801,
    provider: 'cloudflare',
    from: 'new-buyer@example.test',
    to: ['sales@example.test'],
    state: 'unmatched',
    reason: 'unknown_sender_address',
    receivedAt: new Date(Date.now() - 12 * 60_000).toISOString(),
    canRetry: true,
    canAssign: true,
    hasOriginal: true,
  },
  {
    id: 802,
    provider: 'cloudflare',
    from: 'buyer@example.test',
    to: ['sales@example.test'],
    state: 'conflict',
    reason: 'message_id_content_conflict',
    receivedAt: new Date(Date.now() - 30 * 60_000).toISOString(),
    canRetry: true,
    canAssign: false,
    hasOriginal: true,
  },
]
const json = (body: unknown, status = 200) =>
  new Response(JSON.stringify(body), {
    status,
    headers: { 'Content-Type': 'application/json', 'Cache-Control': 'no-store' },
  })

export function handleEmailReceiptRequest(url: string, init?: RequestInit): Response | null {
  const path = new URL(url, location.origin)
  if (!/^\/api\/email\/receipts(?:\/|$)/.test(path.pathname)) return null
  if ((init?.method || 'GET').toUpperCase() !== 'GET')
    return json(
      { error: 'This is a read-only email review example. No customer records have changed.' },
      403,
    )
  if (path.pathname === '/api/email/receipts') {
    const state = path.searchParams.get('state') || 'attention'
    const items = examples.filter((receipt) => state === 'attention' || receipt.state === state)
    return json({
      items,
      total: items.length,
      page: 1,
      pages: items.length ? 1 : 0,
      receiverEnabled: true,
      counts: { unmatched: 1, conflict: 1 },
    })
  }
  const detail = path.pathname.match(/^\/api\/email\/receipts\/(\d+)(?:\/attachments\/(\d+))?$/)
  const receipt = examples.find((item) => item.id === Number(detail?.[1]))
  if (!detail || !receipt) return json({ error: 'Email receipt not found.' }, 404)
  if (detail[2] !== undefined)
    return detail[2] === '0'
      ? new Response(exampleFile, {
          headers: { 'Content-Type': 'application/octet-stream', 'Cache-Control': 'no-store' },
        })
      : json({ error: 'Email attachment not found.' }, 404)
  return json({
    subject: 'Specification and lead time enquiry',
    text: 'Hello,\n\nWe are looking for a supplier for the attached specification. Please confirm the minimum order quantity and current lead time.\n\nThank you,\nExample Buyer',
    items: [attachment],
  })
}
