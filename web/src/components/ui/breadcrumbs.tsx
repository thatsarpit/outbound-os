import { Link } from 'react-router-dom'
import { ChevronRight } from 'lucide-react'
import { cn } from '@/lib/utils'

export type BreadcrumbItem = {
  label: string
  href?: string
}

type BreadcrumbsProps = {
  items: BreadcrumbItem[]
  className?: string
}

export function Breadcrumbs({ items, className }: BreadcrumbsProps) {
  if (items.length === 0) return null

  return (
    <nav aria-label="Breadcrumb" className={cn('text-xs text-text-muted', className)}>
      <ol className="flex flex-wrap items-center gap-1">
        {items.map((item, idx) => {
          const isLast = idx === items.length - 1
          return (
            <li key={`${item.label}-${idx}`} className="flex items-center gap-1">
              {item.href && !isLast ? (
                <Link
                  to={item.href}
                  className="rounded-md px-1 py-0.5 transition-colors hover:bg-surface-raised hover:text-text-primary"
                >
                  {item.label}
                </Link>
              ) : (
                <span
                  aria-current={isLast ? 'page' : undefined}
                  className={cn(
                    'px-1 py-0.5',
                    isLast ? 'text-text-primary font-medium' : 'text-text-muted',
                  )}
                >
                  {item.label}
                </span>
              )}
              {!isLast && (
                <ChevronRight aria-hidden="true" className="h-3 w-3 shrink-0 text-text-muted" />
              )}
            </li>
          )
        })}
      </ol>
    </nav>
  )
}
