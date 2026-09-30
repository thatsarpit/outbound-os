'use client'

import { useEffect, useId, useRef, useState, type KeyboardEvent } from 'react'
import { Inbox, LayoutDashboard, Plug, Sparkles, MessageCircle } from 'lucide-react'
import { site } from '@/lib/site-content'

/**
 * The real dashboard, one screen at a time, in a browser frame.
 *
 * Tabs follow the WAI-ARIA tabs pattern (arrow keys move between them). All
 * panels are in the HTML so every screenshot and caption is crawlable; the
 * inactive ones are hidden, and their images load lazily.
 */

const SHOTS = [
  {
    id: 'overview',
    label: 'Overview',
    Icon: LayoutDashboard,
    path: 'overview',
    caption: 'New leads, messages sent, reply rate, the pipeline — and who needs a person today.',
    alt: 'Outbound OS overview dashboard with lead counts, messages sent, reply rate, pipeline and items needing attention',
  },
  {
    id: 'inbox',
    label: 'Inbox',
    Icon: Inbox,
    path: 'inbox',
    caption: 'WhatsApp, email, Telegram and iMessage threads on the lead they belong to.',
    alt: 'Outbound OS shared inbox with conversations from several channels',
  },
  {
    id: 'integrations',
    label: 'Integrations',
    Icon: Plug,
    path: 'integrations',
    caption: 'Every channel and lead source, with its connection status.',
    alt: 'Outbound OS integrations catalogue showing connected channels and lead sources',
  },
  {
    id: 'setup',
    label: 'Setup wizard',
    Icon: Sparkles,
    path: 'setup',
    caption: 'First sign-in asks a few questions instead of handing you a config file.',
    alt: 'Outbound OS setup wizard asking which lead sources to connect',
  },
  {
    id: 'whatsapp',
    label: 'WhatsApp',
    Icon: MessageCircle,
    path: 'whatsapp-settings',
    caption: 'Meta’s Cloud API or AiSensy, chosen per number.',
    alt: 'Outbound OS WhatsApp settings with Meta Cloud API and AiSensy provider options',
  },
] as const

const DWELL_MS = 6000

export function ProductTour() {
  const [active, setActive] = useState(0)
  const [auto, setAuto] = useState(true)
  const [inView, setInView] = useState(false)
  const [hover, setHover] = useState(false)
  const root = useRef<HTMLDivElement>(null)
  const base = useId()

  // Plays through the screens while it is on screen and not being looked at
  // closely; any click or key press hands control to the visitor.
  useEffect(() => {
    const el = root.current
    if (!el) return
    const observer = new IntersectionObserver(([entry]) => setInView(entry.isIntersecting), { threshold: 0.35 })
    observer.observe(el)
    return () => observer.disconnect()
  }, [])

  const playing = auto && inView && !hover
  useEffect(() => {
    if (!playing || window.matchMedia('(prefers-reduced-motion: reduce)').matches) return
    const timer = window.setTimeout(() => setActive((a) => (a + 1) % SHOTS.length), DWELL_MS)
    return () => window.clearTimeout(timer)
  }, [playing, active])

  const onKey = (event: KeyboardEvent<HTMLButtonElement>) => {
    const last = SHOTS.length - 1
    const next =
      event.key === 'ArrowRight' ? (active === last ? 0 : active + 1)
      : event.key === 'ArrowLeft' ? (active === 0 ? last : active - 1)
      : event.key === 'Home' ? 0
      : event.key === 'End' ? last
      : null
    if (next === null) return
    event.preventDefault()
    setAuto(false)
    setActive(next)
    document.getElementById(`${base}-tab-${next}`)?.focus()
  }

  return (
    <div
      className="tour"
      ref={root}
      data-playing={playing ? 'true' : undefined}
      onMouseEnter={() => setHover(true)}
      onMouseLeave={() => setHover(false)}
    >
      <div className="tour__tabs" role="tablist" aria-label="Product screens">
        {SHOTS.map((shot, index) => (
          <button
            key={shot.id}
            id={`${base}-tab-${index}`}
            type="button"
            role="tab"
            aria-selected={index === active}
            aria-controls={`${base}-panel-${index}`}
            tabIndex={index === active ? 0 : -1}
            className="tour__tab"
            onClick={() => {
              setAuto(false)
              setActive(index)
            }}
            onKeyDown={onKey}
          >
            <shot.Icon size={15} aria-hidden="true" />
            {shot.label}
            {index === active && auto && <span className="tour__progress" key={active} aria-hidden="true" />}
          </button>
        ))}
      </div>

      <div className="tour__stage">
      <div className="tour__frame">
        <div className="tour__chrome" aria-hidden="true">
          <span className="ui__dots">
            <i />
            <i />
            <i />
          </span>
          <span className="tour__url">your-server.com/{SHOTS[active].id === 'overview' ? '' : SHOTS[active].id}</span>
        </div>
        {SHOTS.map((shot, index) => (
          <div
            key={shot.id}
            id={`${base}-panel-${index}`}
            role="tabpanel"
            aria-labelledby={`${base}-tab-${index}`}
            hidden={index !== active}
            className="tour__panel"
          >
            <img
              src={`/screenshots/${shot.path}.webp?v=${site.screenshotVersion}`}
              srcSet={`/screenshots/${shot.path}-800.webp?v=${site.screenshotVersion} 800w, /screenshots/${shot.path}.webp?v=${site.screenshotVersion} 1600w`}
              sizes="(min-width: 1200px) 1130px, 100vw"
              alt={shot.alt}
              width={1600}
              height={1000}
              loading="lazy"
              decoding="async"
            />
          </div>
        ))}
      </div>
      </div>
      <p className="tour__caption" aria-live="polite">
        {SHOTS[active].caption} <span>Sample data.</span>
      </p>
    </div>
  )
}
