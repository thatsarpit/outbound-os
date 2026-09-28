import { MessageCircle, Mail, Store, Globe, ArrowRight } from 'lucide-react'

/**
 * Channels converging into one queue.
 *
 * The central claim of the product is "enquiries arrive everywhere, work them
 * in one place". That is a *shape*, and a shape is the one thing prose is
 * worst at. Four sources on the left, one queue on the right, lines between.
 *
 * Drawn with a grid and CSS rules rather than an SVG so the labels stay real
 * text — selectable, translatable, and readable to a screen reader.
 */

const SOURCES = [
  { icon: MessageCircle, label: 'WhatsApp', note: 'Cloud API', token: '--whatsapp' },
  { icon: Mail, label: 'Email', note: 'Your mailboxes', token: '--email' },
  { icon: Store, label: 'IndiaMART', note: 'Push API', token: '--indiamart' },
  { icon: Globe, label: 'Web forms', note: 'Webhooks & CSV', token: '--text-muted' },
]

export function ChannelFlow({ className }: { className?: string }) {
  return (
    <div className={['flow-diagram', className].filter(Boolean).join(' ')}>
      <ul className="flow-diagram__sources">
        {SOURCES.map(({ icon: Icon, label, note, token }, i) => (
          <li key={label} className="flow-diagram__source" style={{ '--i': i } as React.CSSProperties}>
            <span className="flow-diagram__icon" style={{ color: `var(${token})` }}>
              <Icon size={15} strokeWidth={1.9} aria-hidden="true" />
            </span>
            <span className="flow-diagram__label">
              <strong>{label}</strong>
              <span>{note}</span>
            </span>
          </li>
        ))}
      </ul>

      <div className="flow-diagram__join" aria-hidden="true">
        <span className="flow-diagram__arrow"><ArrowRight size={14} strokeWidth={2} /></span>
      </div>

      <div className="flow-diagram__target">
        <span className="flow-diagram__target-head">One working queue</span>
        <ul className="flow-diagram__target-list">
          <li>Deduplicated against existing buyers</li>
          <li>Scored and ordered</li>
          <li>Assigned to an owner</li>
        </ul>
      </div>
    </div>
  )
}
