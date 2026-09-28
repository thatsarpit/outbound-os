/**
 * The operating loop, drawn.
 *
 * The homepage previously explained this as six numbered paragraphs. That is
 * accurate and completely fails to show that it is a *loop* — that a reply
 * re-enters the queue rather than ending the process. A diagram carries the
 * shape in one glance; the prose then only has to carry the detail.
 *
 * Inline SVG, currentColor throughout, so it inherits the theme and needs no
 * asset request. Labelled with real text rather than icons, because a visitor
 * should not have to decode a pictogram to understand the product.
 */

const STEPS = [
  { label: 'Enquiry', hint: 'WhatsApp · Email · IndiaMART' },
  { label: 'Qualify', hint: 'Scored and owned' },
  { label: 'Reply', hint: 'From the whole thread' },
  { label: 'Follow up', hint: 'Until they answer' },
  { label: 'Close', hint: 'Or back to the queue' },
]

export function OperatingLoop({ className }: { className?: string }) {
  return (
    <figure className={['loop', className].filter(Boolean).join(' ')}>
      <ol className="loop__steps">
        {STEPS.map((step, i) => (
          <li key={step.label} className="loop__step" style={{ '--i': i } as React.CSSProperties}>
            <span className="loop__marker">
              <span className="loop__num tabular">{String(i + 1).padStart(2, '0')}</span>
            </span>
            <span className="loop__text">
              <strong>{step.label}</strong>
              <span>{step.hint}</span>
            </span>
          </li>
        ))}
      </ol>

      {/* The return path. Drawn rather than stated, because "it loops" is the
          one thing the numbered list could not say. */}
      <div className="loop__return" aria-hidden="true">
        <svg viewBox="0 0 400 34" preserveAspectRatio="none" role="presentation">
          <path
            d="M396 2 L396 20 Q396 30 386 30 L14 30 Q4 30 4 20 L4 6"
            fill="none"
            stroke="currentColor"
            strokeWidth="1.25"
            strokeDasharray="4 4"
            vectorEffect="non-scaling-stroke"
          />
          <path d="M4 2 L1 8 L7 8 Z" fill="currentColor" />
        </svg>
        <span className="loop__return-label">A reply re-opens the thread</span>
      </div>
    </figure>
  )
}
