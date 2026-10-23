import { Monitor, Smartphone } from 'lucide-react'
import { site } from '@/lib/site-content'

/** Actual desktop and mobile screens, captured from the sample workspace. */
export function ProductHero() {
  return (
    <figure
      className="product-composition"
      aria-label="Outbound OS on desktop and mobile"
    >
      <div className="product-composition__labels" aria-hidden="true">
        <span>
          <Monitor size={14} /> The full workspace
        </span>
        <span>
          <Smartphone size={14} /> The essentials, on your phone
        </span>
      </div>
      <div className="product-composition__canvas">
        <div className="product-composition__desktop">
          <img
            src={`/screenshots/inbox.webp?v=${site.screenshotVersion}`}
            srcSet={`/screenshots/inbox-800.webp?v=${site.screenshotVersion} 800w, /screenshots/inbox.webp?v=${site.screenshotVersion} 1600w`}
            sizes="(max-width: 600px) 600px, (max-width: 1000px) 85vw, 1000px"
            alt="Desktop shared inbox showing a WhatsApp conversation, customer records and team notes"
            width={1600}
            height={1000}
            fetchPriority="high"
          />
        </div>
        <div className="product-composition__phone">
          <img
            src={`/screenshots/mobile-inbox.webp?v=${site.screenshotVersion}`}
            alt="Outbound OS mobile inbox with WhatsApp, email and Telegram conversations, plus tabs for tasks and leads"
            width={390}
            height={844}
            fetchPriority="high"
          />
        </div>
      </div>
      <figcaption>
        <span>Real product screens. Sample workspace.</span>
        <span>Desktop · Mobile web · Home Screen app</span>
      </figcaption>
    </figure>
  )
}
