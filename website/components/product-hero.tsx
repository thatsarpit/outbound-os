import { ArrowUpRight, Check, MessageSquare, Monitor, Smartphone } from 'lucide-react'
import { site } from '@/lib/site-content'

/** A real product capture. The sample workspace contains no customer records. */
export function ProductHero() {
  return (
    <figure
      className="product-stage"
    >
      <div className="product-stage__toolbar" aria-hidden="true">
        <span className="product-stage__title"><Monitor size={14} /> Your workspace</span>
        <span className="product-stage__address">app.outboundos.space / inbox</span>
        <span className="product-stage__status"><i /> Ready for the next reply</span>
      </div>
      <div className="product-stage__screen">
        <img
          src={`/screenshots/inbox-dark.png?v=${site.screenshotVersion}`}
          alt="Outbound OS shared inbox in dark mode, showing conversation queues, a customer email and the reply composer"
          width={1920}
          height={872}
          fetchPriority="high"
        />
      </div>
      <span className="product-stage__mobile-note">The desktop inbox, in detail. A focused mobile workspace is included.</span>
      <figcaption className="product-stage__caption">
        <span><MessageSquare size={14} /> One inbox. Every customer conversation.</span>
        <a href={`/screenshots/inbox-dark.png?v=${site.screenshotVersion}`}><Check size={14} /> Actual product · View full screen</a>
        <a href={site.demoUrl}><Smartphone size={14} /> Try it on your phone <ArrowUpRight size={13} /></a>
      </figcaption>
    </figure>
  )
}
