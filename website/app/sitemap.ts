import type { MetadataRoute } from 'next'
import { routes } from '@/lib/routes'
import { contentUpdated, siteUrl } from '@/lib/site-content'

export const dynamic = 'force-static'

/** Every indexable page, from the one route registry. lastModified is the
    date the copy was last checked against the code, not the build time — a
    date that changes on every deploy teaches crawlers to ignore it. */
export default function sitemap(): MetadataRoute.Sitemap {
  return routes.map((route) => ({
    url: `${siteUrl}${route.path === '/' ? '' : route.path}`,
    lastModified: contentUpdated,
    changeFrequency: route.changeFrequency,
    priority: route.priority,
  }))
}
