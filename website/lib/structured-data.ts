import { site, siteUrl } from './site-content'

/**
 * schema.org structured data. Search engines and AI answer engines read these
 * to understand what the site is about: an organisation that publishes an
 * open-source business application, free to use, with a source repository.
 *
 * Everything here must match what the page visibly says. Structured data that
 * claims more than the page shows is a guideline violation, not a boost.
 */

type Json = Record<string, unknown>

const ORG_ID = `${siteUrl}/#organization`
const SITE_ID = `${siteUrl}/#website`
const APP_ID = `${siteUrl}/#software`

export function organizationLd(): Json {
  return {
    '@type': 'Organization',
    '@id': ORG_ID,
    name: site.name,
    url: siteUrl,
    logo: `${siteUrl}/icon.svg`,
    email: site.email,
    sameAs: [site.githubUrl],
  }
}

export function websiteLd(): Json {
  return {
    '@type': 'WebSite',
    '@id': SITE_ID,
    name: site.name,
    url: siteUrl,
    description: site.description,
    publisher: { '@id': ORG_ID },
    inLanguage: 'en',
  }
}

export function softwareLd(): Json {
  return {
    '@type': 'SoftwareApplication',
    '@id': APP_ID,
    name: site.name,
    description: site.description,
    url: siteUrl,
    applicationCategory: 'BusinessApplication',
    applicationSubCategory: 'Customer relationship management',
    operatingSystem: 'Linux, macOS, Windows (Docker)',
    softwareVersion: site.version,
    license: site.licenseUrl,
    isAccessibleForFree: true,
    offers: { '@type': 'Offer', price: '0', priceCurrency: 'USD' },
    downloadUrl: site.releasesUrl,
    installUrl: `${siteUrl}/docs/install`,
    screenshot: `${siteUrl}/screenshots/overview.png`,
    featureList: [
      'WhatsApp Cloud API and AiSensy',
      'Email over SMTP/IMAP and Brevo',
      'Telegram and iMessage',
      'Lead webhooks for website forms, Facebook Lead Ads, IndiaMART, Zapier',
      'Follow-up sequences that stop on reply',
      'Campaigns with approved WhatsApp templates',
      'Pipeline, orders and reporting',
      'MCP server for AI agents',
    ],
    publisher: { '@id': ORG_ID },
  }
}

export function sourceCodeLd(): Json {
  return {
    '@type': 'SoftwareSourceCode',
    name: site.name,
    codeRepository: site.githubUrl,
    programmingLanguage: ['JavaScript', 'TypeScript'],
    runtimePlatform: 'Node.js',
    license: site.licenseUrl,
    targetProduct: { '@id': APP_ID },
  }
}

export function faqLd(items: ReadonlyArray<{ q: string; a: string }>): Json {
  return {
    '@type': 'FAQPage',
    mainEntity: items.map((item) => ({
      '@type': 'Question',
      name: item.q,
      acceptedAnswer: { '@type': 'Answer', text: item.a },
    })),
  }
}

export function breadcrumbLd(trail: ReadonlyArray<{ name: string; path: string }>): Json {
  return {
    '@type': 'BreadcrumbList',
    itemListElement: trail.map((crumb, index) => ({
      '@type': 'ListItem',
      position: index + 1,
      name: crumb.name,
      item: `${siteUrl}${crumb.path === '/' ? '' : crumb.path}`,
    })),
  }
}

export function articleLd({
  title,
  description,
  path,
  dateModified,
}: {
  title: string
  description: string
  path: string
  dateModified: string
}): Json {
  return {
    '@type': 'TechArticle',
    headline: title,
    description,
    url: `${siteUrl}${path}`,
    dateModified,
    author: { '@id': ORG_ID },
    publisher: { '@id': ORG_ID },
    about: { '@id': APP_ID },
    inLanguage: 'en',
  }
}

/** Wraps nodes in one @graph so a page emits a single, linked JSON-LD block. */
export function graph(...nodes: Json[]): Json {
  return { '@context': 'https://schema.org', '@graph': nodes }
}
