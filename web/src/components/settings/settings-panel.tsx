import type { ReactNode, ElementType } from 'react'

/**
 * Settings use the same surface and heading rhythm as dashboard sections.
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
    <section className="min-w-0 overflow-hidden rounded-lg border border-border bg-surface shadow-sm">
      <div className="flex flex-wrap items-start justify-between gap-3 border-b border-border px-5 py-4">
        <div className="flex min-w-0 flex-1 items-start gap-3">
          <div className="mt-0.5 flex h-8 w-8 shrink-0 items-center justify-center rounded-md border border-border bg-surface-raised text-text-secondary">
            <Icon aria-hidden="true" className="h-4 w-4" />
          </div>
          <div className="min-w-0">
            <h2 className="text-sm font-semibold tracking-tight">{title}</h2>
            <p className="mt-1 max-w-2xl text-[13px] leading-5 text-text-secondary">
              {description}
            </p>
          </div>
        </div>
        {action}
      </div>
      <div className="space-y-4 p-5">{children}</div>
      {footer && (
        <div className="flex flex-wrap items-center justify-end gap-2 border-t border-border bg-surface-raised/30 px-5 py-3">
          {footer}
        </div>
      )}
    </section>
  )
}
