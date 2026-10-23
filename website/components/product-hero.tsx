import { Monitor, Smartphone } from 'lucide-react'
import { InboxPreview } from './product-preview'

/** Keep the product story readable before animation or hydration. */
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
          <InboxPreview />
        </div>
        <div className="product-composition__phone">
          <InboxPreview mobile />
        </div>
      </div>
      <figcaption>
        <span>Product illustrations · Fictional workspace</span>
        <span>Desktop · Mobile web · Home Screen app</span>
      </figcaption>
    </figure>
  )
}
