'use client'

import { useEffect } from 'react'

/**
 * Fades sections in as they scroll into view. Mark an element with
 * data-reveal; add style={{'--rd': n}} to stagger siblings. Nothing is hidden
 * until this has run, and nothing is hidden at all under reduced motion.
 */
export function RevealRoot() {
  useEffect(() => {
    if (window.matchMedia('(prefers-reduced-motion: reduce)').matches) return
    const root = document.documentElement
    root.classList.add('reveal-ready')
    const observer = new IntersectionObserver(
      (entries) => {
        for (const entry of entries) {
          if (entry.isIntersecting) {
            entry.target.classList.add('is-in')
            observer.unobserve(entry.target)
          }
        }
      },
      { rootMargin: '0px 0px -8% 0px' },
    )
    document.querySelectorAll('[data-reveal]').forEach((el) => observer.observe(el))
    return () => observer.disconnect()
  }, [])
  return null
}
