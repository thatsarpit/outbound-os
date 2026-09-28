import type { ReactNode } from 'react'
import { SiteHeader } from './site-header'
import { SiteFooter } from './site-footer'

/**
 * The page shell.
 *
 * Deliberately thin. It previously wrapped every route in a JS smooth-scroll
 * provider and a floating WhatsApp button: the first overrode the browser's
 * native scrolling for no functional gain, and the second mixed a pre-sales
 * CTA with a support channel on every page. Contact routes now live on the
 * pages that should own them.
 */
export function MarketingLayout({ children }: { children: ReactNode }) {
  return (
    <>
      <a className="skip-link" href="#main">
        Skip to content
      </a>
      <SiteHeader />
      <main id="main">{children}</main>
      <SiteFooter />
    </>
  )
}
