import { createSocialCard } from '@/components/social-card'
import { cardKey, routes } from '@/lib/routes'

/**
 * One share card per page, rendered at build time to /og/<page>.png. A route
 * handler rather than per-folder opengraph-image files, so a page only has to
 * exist in lib/routes.ts to get its own card.
 */
export const dynamic = 'force-static'
export const dynamicParams = false

export function generateStaticParams() {
  return routes.map((route) => ({ card: `${cardKey(route.path)}.png` }))
}

export async function GET(_request: Request, { params }: { params: Promise<{ card: string }> }) {
  const { card } = await params
  const route = routes.find((r) => `${cardKey(r.path)}.png` === card)
  if (!route) return new Response('Not found', { status: 404 })
  return createSocialCard({ eyebrow: route.eyebrow, headline: route.headline })
}
