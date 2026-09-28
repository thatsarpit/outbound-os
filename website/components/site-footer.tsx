import Link from 'next/link'
import { footerNav, legalNav, site } from '@/lib/site-content'
import { Wordmark } from './wordmark'

/**
 * Site footer — the sitemap and the trust signals.
 *
 * B2B buyers come here looking for what the marketing pages skip: who the
 * company is, how to reach a person, and what the policies are.
 */
export function SiteFooter() {
  return (
    <footer className="footer">
      <div className="page footer__inner">
        <div className="footer__top">
          <div>
            <Link href="/" className="header__brand" aria-label={`${site.name} home`}>
              <Wordmark />
            </Link>
            <p className="footer__brand-line">{site.description}</p>
          </div>

          <div className="footer__cols">
            {footerNav.map((col) => (
              <div className="footer__col" key={col.heading}>
                <h2>{col.heading}</h2>
                <ul>
                  {col.links.map((l) => (
                    <li key={l.href + l.label}>
                      {l.href.startsWith('http') ? (
                        <a href={l.href}>{l.label}</a>
                      ) : (
                        <Link href={l.href}>{l.label}</Link>
                      )}
                    </li>
                  ))}
                </ul>
              </div>
            ))}
          </div>
        </div>

        <div className="footer__bottom">
          <span>
            &copy; {new Date().getFullYear()} {site.name}
          </span>
          <div className="footer__legal">
            {legalNav.map((l) => (
              <Link key={l.href} href={l.href}>
                {l.label}
              </Link>
            ))}
            <a href={`mailto:${site.email}`}>{site.email}</a>
          </div>
        </div>
      </div>
    </footer>
  )
}
