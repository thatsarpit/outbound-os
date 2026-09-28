import type { MetadataRoute } from 'next'
import { siteUrl } from '@/lib/site-content'

export const dynamic = 'force-static'

/** Everything is public, including to AI crawlers: being cited in AI answers
    is how many people will first hear of an open-source project. */
export default function robots(): MetadataRoute.Robots {
  return {
    rules: { userAgent: '*', allow: '/' },
    sitemap: `${siteUrl}/sitemap.xml`,
    host: siteUrl,
  }
}
