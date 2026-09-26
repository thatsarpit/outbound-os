import type { ReactNode, ElementType } from 'react'

/**
 * The titled, icon-headed card every Settings section renders its fields
 * inside. Extracted verbatim from the former monolithic settings.tsx.
 */
export function SettingsPanel({
  icon: Icon,
  title,
  description,
  action,
  footer,
  children,
}: {
  icon: ElementType
  title: string
  description: string
  /** Secondary header control (a toggle, a link). Not the save button. */
  action?: ReactNode
  /**
   * The panel's primary action. Sits after the fields, because a save button
   * placed above the form reads as applying to whatever is above it — and
   * below the `lg` breakpoint the header stacks, so it rendered as a
   * full-width slab between the description and the first input.
   */
  footer?: ReactNode
  children: ReactNode
}) {
  return (
    <section className="glass rounded-md p-6">
      <div className="mb-5 flex flex-col gap-4 border-b border-border pb-5 lg:flex-row lg:items-start lg:justify-between">
        <div className="flex items-start gap-3">
          <div className="flex h-11 w-11 items-center justify-center rounded-md bg-accent-muted text-accent">
            <Icon className="h-5 w-5" />
          </div>
          <div>
            <h2 className="text-lg font-semibold tracking-tight">{title}</h2>
            <p className="mt-1 max-w-2xl text-sm text-text-secondary">{description}</p>
          </div>
        </div>
        {action}
      </div>
      <div className="space-y-5">{children}</div>
      {footer && (
        <div className="mt-5 flex items-center justify-end gap-2 border-t border-border pt-4">
          {footer}
        </div>
      )}
    </section>
  )
}
