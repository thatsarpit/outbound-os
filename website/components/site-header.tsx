'use client'

import Link from 'next/link'
import { usePathname } from 'next/navigation'
import { useEffect, useRef, useState } from 'react'
import { ChevronDown, Menu, X } from 'lucide-react'
import { directNav, navGroups, site } from '@/lib/site-content'
import { Wordmark } from './wordmark'

/** GitHub's mark, inline: lucide dropped brand icons. */
function GitHubMark() {
  return (
    <svg width="15" height="15" viewBox="0 0 16 16" fill="currentColor" aria-hidden="true">
      <path d="M8 0C3.58 0 0 3.58 0 8c0 3.54 2.29 6.53 5.47 7.59.4.07.55-.17.55-.38 0-.19-.01-.82-.01-1.49-2.01.37-2.53-.49-2.69-.94-.09-.23-.48-.94-.82-1.13-.28-.15-.68-.52-.01-.53.63-.01 1.08.58 1.23.82.72 1.21 1.87.87 2.33.66.07-.52.28-.87.51-1.07-1.78-.2-3.64-.89-3.64-3.95 0-.87.31-1.59.82-2.15-.08-.2-.36-1.02.08-2.12 0 0 .67-.21 2.2.82.64-.18 1.32-.27 2-.27.68 0 1.36.09 2 .27 1.53-1.04 2.2-.82 2.2-.82.44 1.1.16 1.92.08 2.12.51.56.82 1.27.82 2.15 0 3.07-1.87 3.75-3.65 3.95.29.25.54.73.54 1.48 0 1.07-.01 1.93-.01 2.2 0 .21.15.46.55.38A8.013 8.013 0 0016 8c0-4.42-3.58-8-8-8z" />
    </svg>
  )
}

/**
 * Grouped navigation for a product with several distinct working surfaces.
 * Desktop discloses one compact menu at a time; mobile renders every route in
 * source order so navigation never depends on a nested accordion working.
 */
export function SiteHeader() {
  const pathname = usePathname()
  const [mobileOpen, setMobileOpen] = useState(false)
  const [activeMenu, setActiveMenu] = useState<string | null>(null)
  const headerRef = useRef<HTMLElement>(null)
  const activeButtonRef = useRef<HTMLButtonElement | null>(null)

  useEffect(() => {
    setMobileOpen(false)
    setActiveMenu(null)
  }, [pathname])

  useEffect(() => {
    if (!activeMenu) return

    const closeOutside = (event: PointerEvent) => {
      if (!headerRef.current?.contains(event.target as Node)) setActiveMenu(null)
    }
    const closeWithEscape = (event: KeyboardEvent) => {
      if (event.key !== 'Escape') return
      setActiveMenu(null)
      activeButtonRef.current?.focus()
    }

    document.addEventListener('pointerdown', closeOutside)
    document.addEventListener('keydown', closeWithEscape)
    return () => {
      document.removeEventListener('pointerdown', closeOutside)
      document.removeEventListener('keydown', closeWithEscape)
    }
  }, [activeMenu])

  const isCurrent = (href: string) => {
    const route = href.split('#')[0]
    return route === '/' ? pathname === '/' : pathname.startsWith(route)
  }

  return (
    <header className="header" ref={headerRef}>
      <div className="page header__inner">
        <Link href="/" className="header__brand" aria-label={`${site.name} home`}>
          <Wordmark />
        </Link>

        <nav className="header__nav" aria-label="Primary">
          {navGroups.map((group) => {
            const menuId = `menu-${group.label.toLowerCase()}`
            const expanded = activeMenu === group.label
            const groupCurrent = group.columns.some((column) =>
              column.links.some((link) => isCurrent(link.href)),
            )

            return (
              <div className="header__nav-group" key={group.label}>
                <button
                  type="button"
                  className="header__link header__link--menu"
                  aria-expanded={expanded}
                  aria-controls={menuId}
                  data-current={groupCurrent ? 'true' : undefined}
                  onClick={(event) => {
                    activeButtonRef.current = event.currentTarget
                    setActiveMenu(expanded ? null : group.label)
                  }}
                >
                  {group.label}
                  <ChevronDown size={13} aria-hidden="true" />
                </button>

                {expanded && (
                  <div className="mega-menu" id={menuId}>
                    {group.columns.map((column) => (
                      <div className="mega-menu__column" key={column.heading}>
                        <p className="mega-menu__heading">{column.heading}</p>
                        {column.links.map((link) => (
                          <Link
                            key={link.href}
                            href={link.href}
                            className="mega-menu__link"
                            aria-current={isCurrent(link.href) ? 'page' : undefined}
                          >
                            <span>{link.label}</span>
                            <small>{link.description}</small>
                          </Link>
                        ))}
                      </div>
                    ))}
                  </div>
                )}
              </div>
            )
          })}

          <a className="header__link" href={site.demoUrl}>
            Live demo
          </a>
          {directNav.map((item) => (
            <Link
              key={item.href}
              href={item.href}
              className="header__link"
              aria-current={isCurrent(item.href) ? 'page' : undefined}
            >
              {item.label}
            </Link>
          ))}
        </nav>

        <div className="header__actions">
          <a className="btn btn--ghost btn--sm" href={site.githubUrl}>
            <GitHubMark />
            GitHub
          </a>
          <Link className="btn btn--primary btn--sm" href="/docs/install">
            Get started
          </Link>
        </div>

        <button
          type="button"
          className="header__toggle"
          aria-expanded={mobileOpen}
          aria-controls="site-menu"
          aria-label={mobileOpen ? 'Close menu' : 'Open menu'}
          onClick={() => setMobileOpen((value) => !value)}
        >
          {mobileOpen ? <X size={17} /> : <Menu size={17} />}
        </button>
      </div>

      {mobileOpen && (
        <div className="header__menu" id="site-menu">
          <div className="page header__menu-inner">
            {navGroups.map((group) => (
              <section className="header__menu-group" key={group.label}>
                <p className="header__menu-heading">{group.label}</p>
                {group.columns.flatMap((column) =>
                  column.links.map((link) => (
                    <Link
                      key={link.href}
                      href={link.href}
                      className="header__menu-link"
                      aria-current={isCurrent(link.href) ? 'page' : undefined}
                    >
                      {link.label}
                    </Link>
                  )),
                )}
              </section>
            ))}
            <a className="header__menu-link header__menu-link--direct" href={site.demoUrl}>
              Live demo
            </a>
            {directNav.map((item) => (
              <Link
                key={item.href}
                href={item.href}
                className="header__menu-link header__menu-link--direct"
                aria-current={isCurrent(item.href) ? 'page' : undefined}
              >
                {item.label}
              </Link>
            ))}
            <div className="header__menu-actions">
              <a className="btn btn--secondary" href={site.githubUrl}>
                <GitHubMark />
                GitHub
              </a>
              <Link className="btn btn--primary" href="/docs/install">
                Get started
              </Link>
            </div>
          </div>
        </div>
      )}
    </header>
  )
}
