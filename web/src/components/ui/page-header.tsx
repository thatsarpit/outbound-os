import type { ReactNode } from 'react'
import { cn } from '@/lib/utils'
import { Breadcrumbs, type BreadcrumbItem } from './breadcrumbs'

type PageHeaderProps = {
  eyebrow?: string
  title: string
  description?: ReactNode
  breadcrumbs?: BreadcrumbItem[]
  chips?: ReactNode
  actions?: ReactNode
  className?: string
}

export function PageHeader({
  eyebrow,
  title,
  description,
  breadcrumbs,
  chips,
  actions,
  className,
}: PageHeaderProps) {
  return (
    <section className={cn('animate-fade-in', className)}>
      {breadcrumbs && breadcrumbs.length > 0 ? (
        <Breadcrumbs items={breadcrumbs} className="mb-3" />
      ) : null}
      <div className="flex flex-col gap-4 lg:flex-row lg:items-start lg:justify-between">
        <div className="min-w-0 max-w-3xl">
          {eyebrow ? (
            <p className="text-[10px] font-semibold uppercase tracking-[0.12em] text-text-muted">
              {eyebrow}
            </p>
          ) : null}
          <h1 className="mt-1 text-xl font-semibold tracking-tight text-text-primary">{title}</h1>
          {description ? (
            <p className="mt-1 text-[13px] leading-5 text-text-secondary">{description}</p>
          ) : null}
          {chips ? <div className="mt-4 flex flex-wrap gap-2">{chips}</div> : null}
        </div>
        {actions ? (
          <div className="flex shrink-0 flex-wrap items-center gap-2">{actions}</div>
        ) : null}
      </div>
    </section>
  )
}

/**
 * Small pill used alongside PageHeader for chips.
 */
export function HeaderChip({
  label,
  value,
  tone = 'default',
}: {
  label: string
  value: string | number
  tone?: 'default' | 'accent' | 'success' | 'warning' | 'danger'
}) {
  const TONE_CLASSES: Record<string, string> = {
    default: 'bg-surface-raised text-text-secondary',
    accent: 'bg-accent-muted text-accent',
    success: 'bg-success-muted text-success',
    warning: 'bg-warning-muted text-warning',
    danger: 'bg-danger-muted text-danger',
  }
  return (
    <span
      className={cn(
        'inline-flex items-center gap-1.5 rounded-sm border border-border px-2 py-0.5 text-[11px] font-medium',
        TONE_CLASSES[tone],
      )}
    >
      <span className="text-text-muted">{label}</span>
      <span className="font-semibold">{value}</span>
    </span>
  )
}
