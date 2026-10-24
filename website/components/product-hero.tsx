import { ArrowUpRight, Maximize2, Monitor, Smartphone } from 'lucide-react'
import { site } from '@/lib/site-content'
import { MotionToggle } from './motion-toggle'

/** Genuine desktop and mobile captures of the same sample workspace. */
export function ProductHero() {
  return (
    <figure className="product-stage">
      <div className="product-stage__toolbar">
        <span className="product-stage__title"><Monitor size={14} /> The shared inbox</span>
        <span className="product-stage__address" aria-hidden="true">outbound os / workspace</span>
        <MotionToggle />
      </div>
      <div className="product-stage__screen">
        <picture>
          <source media="(max-width: 600px)" srcSet={`/screenshots/mobile-conversation.webp?v=${site.screenshotVersion}`} width={390} height={844} />
          <img src={`/screenshots/inbox.webp?v=${site.screenshotVersion}`} alt="Outbound OS in dark mode: a shared conversation queue, customer email history and reply composer; on phones, the focused WhatsApp conversation" width={1440} height={960} fetchPriority="high" />
        </picture>
        <a className="product-stage__open product-stage__open--desktop" href={`/screenshots/inbox.webp?v=${site.screenshotVersion}`} aria-label="View the full desktop inbox screenshot"><span className="product-stage__expand"><Maximize2 size={13} /> View product screen</span></a>
        <a className="product-stage__open product-stage__open--mobile" href={`/screenshots/mobile-conversation.webp?v=${site.screenshotVersion}`} aria-label="View the full mobile conversation screenshot"><span className="product-stage__expand"><Maximize2 size={13} /> View mobile screen</span></a>
      </div>
      <figcaption className="product-stage__caption">
        <span>One inbox. The customer&rsquo;s full story.</span>
        <span>Actual product · sample workspace</span>
        <a href={site.mobileDemoUrl}><Smartphone size={14} /> Open the mobile demo <ArrowUpRight size={13} /></a>
      </figcaption>
    </figure>
  )
}
