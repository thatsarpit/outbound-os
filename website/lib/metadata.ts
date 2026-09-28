import type { Metadata } from 'next'
import { cardKey, routeFor } from './routes'
import { site, siteUrl } from './site-content'

/**
 * Page metadata in one shape, so every page gets the same complete set:
 * a unique title and description, a canonical URL on the apex domain, and
 * Open Graph / X cards that carry the page's own title.
 *
 * Titles are written per page to stay under ~60 characters with the most
 * specific words first; the brand is appended by the root title template.
 */
export function buildMetadata(
  title: string,
  description: string,
  path = '/',
  options: { absoluteTitle?: boolean; type?: 'website' | 'article'; noindex?: boolean } = {},
): Metadata {
  const url = `${siteUrl}${path === '/' ? '' : path}`
  const fullTitle = options.absoluteTitle ? title : `${title} | ${site.name}`
  // Each registered page has its own card at /og/<page>.png; anything else
  // falls back to the home card rather than sharing without an image.
  const route = routeFor(path)
  const image = {
    url: `/og/${cardKey(route ? path : '/')}.png`,
    width: 1200,
    height: 630,
    alt: route ? route.headline : site.name,
  }
  return {
    title: options.absoluteTitle ? { absolute: title } : title,
    description,
    metadataBase: new URL(siteUrl),
    alternates: { canonical: path },
    openGraph: {
      title: fullTitle,
      description,
      url,
      siteName: site.name,
      type: options.type ?? 'website',
      locale: 'en_US',
      images: [image],
    },
    twitter: {
      card: 'summary_large_image',
      title: fullTitle,
      description,
      images: [image.url],
    },
    ...(options.noindex ? { robots: { index: false, follow: true } } : {}),
  }
}
