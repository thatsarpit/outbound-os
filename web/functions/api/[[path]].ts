/**
 * API proxy for the dashboard.
 *
 * The dashboard calls a same-origin `/api/*` (see src/api/client.ts, which
 * hardcodes API_BASE = '/api'). On Vercel that was satisfied by a rewrite in
 * vercel.json. Cloudflare Pages does not read that file, and `_redirects`
 * cannot proxy to an external origin — so the rewrite is a Function instead.
 *
 * Keeping it same-origin rather than pointing the browser straight at the
 * backend means no CORS configuration on the API and no third-party-cookie
 * concerns if auth ever moves off bearer tokens.
 *
 * ORIGIN is overridable per-environment so staging and production can differ
 * without a code change.
 */

interface Env {
  API_ORIGIN?: string
}

const DEFAULT_ORIGIN = 'https://api.outboundos.space'

export const onRequest: PagesFunction<Env> = async (context) => {
  const { request, env, params } = context
  const origin = env.API_ORIGIN || DEFAULT_ORIGIN

  const path = Array.isArray(params.path) ? params.path.join('/') : (params.path ?? '')
  const incoming = new URL(request.url)
  const target = `${origin}/api/${path}${incoming.search}`

  // Forward the request as-is apart from Host, which must belong to the origin.
  const headers = new Headers(request.headers)
  headers.delete('host')

  const init: RequestInit = {
    method: request.method,
    headers,
    redirect: 'manual',
  }

  // GET/HEAD must not carry a body, and duplex is required for streaming ones.
  if (request.method !== 'GET' && request.method !== 'HEAD') {
    init.body = request.body
    // @ts-expect-error -- duplex is required by the runtime for streamed bodies
    init.duplex = 'half'
  }

  try {
    const response = await fetch(target, init)
    // Strip hop-by-hop headers the edge should not relay verbatim.
    const out = new Headers(response.headers)
    out.delete('transfer-encoding')
    out.delete('connection')
    return new Response(response.body, {
      status: response.status,
      statusText: response.statusText,
      headers: out,
    })
  } catch (error) {
    // Return a stable JSON error when the AWS API is temporarily unavailable
    // rather than surfacing an opaque Pages Function failure.
    return new Response(
      JSON.stringify({
        error: 'Backend unreachable',
        detail: error instanceof Error ? error.message : String(error),
      }),
      { status: 502, headers: { 'content-type': 'application/json' } },
    )
  }
}
