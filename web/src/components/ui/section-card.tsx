import { cn } from '@/lib/utils'

/**
 * Standard page section: a flat surface with a hairline border and a titled
 * header. Previously this wrapped its content in two absolutely-positioned
 * decorative layers (a green radial wash and a white grid) over a 1px gradient
 * ring; a data container should be a calm ground, so both are gone.
 */
export function SectionCard({
  title,
  description,
  eyebrow,
  action,
  children,
  className,
}: {
  title: string
  description?: string
  /** Small label above the title. Omit unless it says something the title doesn't. */
  eyebrow?: string
  action?: React.ReactNode
  children: React.ReactNode
  className?: string
}) {
  return (
    <section
      className={cn(
        'min-w-0 overflow-hidden rounded-lg border border-border bg-surface shadow-sm',
        className,
      )}
    >
      <div className="flex flex-col gap-3 border-b border-border px-5 py-4 sm:px-6 lg:flex-row lg:items-start lg:justify-between">
        <div className="min-w-0">
          {eyebrow && (
            <p className="text-[10px] font-semibold uppercase tracking-[0.12em] text-text-muted">
              {eyebrow}
            </p>
          )}
          <h2 className={cn('text-sm font-semibold tracking-tight', eyebrow && 'mt-1')}>{title}</h2>
          {description && (
            <p className="mt-1 max-w-2xl text-[13px] leading-5 text-text-secondary">
              {description}
            </p>
          )}
        </div>
        {action && <div className="shrink-0">{action}</div>}
      </div>
      <div className="p-5 sm:p-6">{children}</div>
    </section>
  )
}
