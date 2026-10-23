import Script from 'next/script'
import type { Metadata, Viewport } from 'next'
import type { ReactNode } from 'react'
import localFont from 'next/font/local'
import './globals.css'
import { MarketingLayout } from '@/components/marketing-layout'
import { JsonLd } from '@/components/json-ld'
import { RevealRoot } from '@/components/reveal'
import { buildMetadata } from '@/lib/metadata'
import { site } from '@/lib/site-content'
import { graph, organizationLd, softwareLd, sourceCodeLd, websiteLd } from '@/lib/structured-data'

/** Keep the local typeface consistent across every marketing page. */
const inter = localFont({
  src: './fonts/inter-latin.woff2',
  display: 'swap',
  weight: '400 600',
  variable: '--font-inter',
})

const HOME_TITLE = 'Outbound OS — Open-source WhatsApp CRM & expert setup'

export const metadata: Metadata = {
  ...buildMetadata(HOME_TITLE, site.description, '/', { absoluteTitle: true }),
  // Pages set a short title; the brand is appended here, once.
  title: { default: HOME_TITLE, template: `%s | ${site.name}` },
  applicationName: site.name,
  category: 'business',
  manifest: '/manifest.webmanifest',
  authors: [{ name: site.name, url: site.githubUrl }],
  creator: site.name,
  publisher: site.name,
  formatDetection: { telephone: false, email: false, address: false },
}

export const viewport: Viewport = {
  themeColor: '#0b0b0e',
}

export default function RootLayout({ children }: { children: ReactNode }) {
  return (
    <html lang="en" className={inter.variable}>
      <body>
        {/* Who publishes the site and what the software is, once per page.
            Pages add their own nodes (FAQ, breadcrumbs, articles) beside it. */}
        <JsonLd data={graph(organizationLd(), websiteLd(), softwareLd(), sourceCodeLd())} />
        <MarketingLayout>{children}</MarketingLayout>
        <RevealRoot />
        <Script
          src="/site-analytics.js"
          data-ga-id="G-GS1BKVLCM0"
          data-ga-hosts="outboundos.space,www.outboundos.space"
          data-ga-name="Outbound OS"
          strategy="afterInteractive"
        />
      </body>
    </html>
  )
}
