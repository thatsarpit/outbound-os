interface Env {
  API_ORIGIN?: string
  ASSETS: Fetcher
}

// The API owns each widget's exact frame-ancestors list. Pages serves the
// current dashboard bundle while enforcing that same rule on the HTML.
export const onRequestGet: PagesFunction<Env> = async ({ request, env, params }) => {
  const key = params.key
  const headers = new Headers({
    'Cache-Control': 'no-store',
    'Content-Security-Policy': "frame-ancestors 'none'",
    'X-Content-Type-Options': 'nosniff',
    'Referrer-Policy': 'no-referrer',
    'X-Robots-Tag': 'noindex',
  })
  if (typeof key !== 'string' || !/^[a-z][a-z0-9-]{0,39}$/.test(key)) {
    return new Response('Chat is unavailable.', { status: 404, headers })
  }
  try {
    const apiOrigin = env.API_ORIGIN || 'https://api.outboundos.space'
    const policy = await fetch(new URL(`/chat/widget/${key}`, apiOrigin), { redirect: 'manual', signal: AbortSignal.timeout(5000) })
    const csp = policy.headers.get('Content-Security-Policy')
    if (!policy.ok || !csp || !/(?:^|;)\s*frame-ancestors [^;]+/.test(csp)) {
      await policy.body?.cancel()
      return new Response('Chat is unavailable.', { status: policy.status === 404 ? 404 : 503, headers })
    }
    await policy.body?.cancel()
    const asset = await env.ASSETS.fetch(new URL('/', request.url))
    if (!asset.ok) return new Response('Chat is temporarily unavailable.', { status: 503, headers })
    headers.set('Content-Security-Policy', csp)
    headers.set('Content-Type', 'text/html; charset=utf-8')
    return new Response(asset.body, { headers })
  } catch {
    return new Response('Chat is temporarily unavailable.', { status: 503, headers })
  }
}
