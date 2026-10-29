const sampleId = '00000000-0000-4000-8000-000000000076'
const batch = {
  id: sampleId, status: 'completed', total: 3, checked: 3,
  counts: { ready: 1, invalid: 1, unknown: 1 },
  createdAt: '2026-01-15T09:00:00.000Z', completedAt: '2026-01-15T09:00:01.000Z',
  error: null, checks: 'syntax_disposable_mx', mailboxVerified: false,
}
const json = (value: unknown, status = 200) => new Response(JSON.stringify(value), {
  status, headers: { 'Content-Type': 'application/json', 'Cache-Control': 'no-store' },
})
export function handleEmailVerificationRequest(url: string, init?: RequestInit): Response | null {
  const path = new URL(url, 'https://demo.example.test').pathname
  if (!path.startsWith('/api/email/verification/')) return null
  if ((init?.method || 'GET').toUpperCase() !== 'GET')
    return json({ error: 'This is a read-only verification example. No addresses were checked or sent.' }, 403)
  if (path === '/api/email/verification/jobs') return json({ enabled: true, jobs: [batch] })
  if (path === `/api/email/verification/jobs/${sampleId}`) return json({ ...batch, page: 1, pages: 1, results: [
    { email: 'buyer@example.test', status: 'ready', reason: 'mail_domain_ready', mailboxVerified: false },
    { email: 'incorrect-address', status: 'invalid', reason: 'invalid_syntax', mailboxVerified: false },
    { email: 'review@example.test', status: 'unknown', reason: 'dns_unavailable', mailboxVerified: false },
  ] })
  return json({ error: 'Sample batch not found.' }, 404)
}
