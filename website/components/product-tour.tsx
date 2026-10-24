'use client'

import { useId, useState, type KeyboardEvent } from 'react'
import {
  Inbox,
  LayoutDashboard,
  Plug,
  Sparkles,
  MessageCircle,
} from 'lucide-react'
import { site } from '@/lib/site-content'
import { productScreens } from '@/lib/product-screens'

/**
 * Desktop and mobile product screens, with manual keyboard-accessible tabs.
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
    caption:
      'A daily view of new leads, messages sent and the people who replied.',
    alt: 'Outbound OS dark overview with lead counts, messages sent by channel and items needing attention',
  },
  {
    id: 'inbox',
    label: 'Inbox',
    Icon: Inbox,
    path: 'inbox',
    caption:
      'WhatsApp, email, Telegram and iMessage threads on the lead they belong to.',
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
    caption:
      'First sign-in asks a few questions instead of handing you a config file.',
    alt: 'Outbound OS setup wizard asking for the business name, time zone and contact details',
  },
  {
    id: 'whatsapp',
    label: 'WhatsApp',
    Icon: MessageCircle,
    path: 'whatsapp-settings',
    caption:
      'Connect directly to Meta. Manage your numbers, credentials and delivery rules.',
    alt: 'Outbound OS dark WhatsApp connection settings with two sample sender accounts and saved API connection fields',
  },
] as const

export function ProductTour() {
  const [active, setActive] = useState(0)
  const base = useId()

  const onKey = (event: KeyboardEvent<HTMLButtonElement>) => {
    const last = SHOTS.length - 1
    const next =
      event.key === 'ArrowRight'
        ? active === last
          ? 0
          : active + 1
        : event.key === 'ArrowLeft'
          ? active === 0
            ? last
            : active - 1
          : event.key === 'Home'
            ? 0
            : event.key === 'End'
              ? last
              : null
    if (next === null) return
    event.preventDefault()
    setActive(next)
    document.getElementById(`${base}-tab-${next}`)?.focus()
  }

  return (
    <div className="tour">
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
            onClick={() => setActive(index)}
            onKeyDown={onKey}
          >
            <shot.Icon size={15} aria-hidden="true" />
            {shot.label}
          </button>
        ))}
      </div>

      <div className="tour__stage">
        <div className="tour__frame">
          <div className="tour__chrome" aria-hidden="true">
            <span>OUTBOUND OS / INSIDE THE WORKSPACE</span>
            <span>{SHOTS[active].label}</span>
          </div>
          {SHOTS.map((shot, index) => (
            <div
              key={shot.id}
              id={`${base}-panel-${index}`}
              role="tabpanel"
              aria-labelledby={`${base}-tab-${index}`}
              hidden={index !== active}
              className="tour__panel"
              tabIndex={0}
            >
              <a href={`/screenshots/${shot.path}.webp?v=${site.screenshotVersion}`} aria-label={`View ${shot.label.toLowerCase()} screen at full size`}>
                <img
                  src={`/screenshots/${shot.path}.webp?v=${site.screenshotVersion}`}
                  srcSet={`/screenshots/${shot.path}-800.webp?v=${site.screenshotVersion} 800w, /screenshots/${shot.path}.webp?v=${site.screenshotVersion} ${productScreens[shot.path].width}w`}
                  sizes="(min-width: 1200px) 1130px, 100vw"
                  alt={shot.alt}
                  width={productScreens[shot.path].width}
                  height={productScreens[shot.path].height}
                  loading="lazy"
                  decoding="async"
                />
              </a>
            </div>
          ))}
        </div>
      </div>
      <p className="tour__caption" aria-live="polite">
        {SHOTS[active].caption}{' '}
        <span>
          Product screenshot · sample data. Select a screen to view full size.
        </span>
      </p>
    </div>
  )
}
