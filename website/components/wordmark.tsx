import { BrandMark } from './brand-mark'

/**
 * The primary lockup. Text stays as real text so it remains crisp, searchable
 * and accessible at every size; the controlled spacing and weight make it a
 * wordmark rather than a loose icon-and-label pair.
 */
export function Wordmark({ className }: { className?: string }) {
  return (
    <span className={['wordmark', className].filter(Boolean).join(' ')}>
      <BrandMark className="wordmark__mark" />
      <span className="wordmark__name">
        Outbound <span className="wordmark__os">OS</span>
      </span>
    </span>
  )
}
