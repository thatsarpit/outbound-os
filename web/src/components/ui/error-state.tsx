import { cn } from '@/lib/utils'
import { AlertTriangle, RefreshCw } from 'lucide-react'
import { Button } from './button'

/**
 * ErrorState — canonical "this fetch failed" UI.
 *
 * Pair every useQuery whose failure mode is user-visible with this. Don't let
 * API errors render as an empty card or a stale skeleton forever — surface
 * them so the operator can retry.
 *
 *   <ErrorState title="Couldn't load leads"
 *               description={error.message}
 *               onRetry={() => refetch()} />
 *
 * For full-screen route crashes, use <ErrorBoundary> at the layout level.
 */
export function ErrorState({
  title = 'Something went wrong',
  description,
  onRetry,
  compact = false,
  className,
}: {
  title?: string
  description?: string
  onRetry?: () => void
  compact?: boolean
  className?: string
}) {
  return (
    <div
      className={cn(
        'flex flex-col items-center justify-center text-center rounded-lg border border-dashed border-danger/40 bg-danger-muted/20 animate-fade-in',
        compact ? 'p-6' : 'py-16 px-6',
        className,
      )}
      role="alert"
    >
      <div
        className={cn(
          'flex items-center justify-center rounded-full mb-4 border border-danger/30 bg-danger-muted',
          compact ? 'h-12 w-12' : 'h-16 w-16',
        )}
      >
        <AlertTriangle
          className={cn('text-danger', compact ? 'h-5 w-5' : 'h-7 w-7')}
          aria-hidden="true"
        />
      </div>
      <h3 className={cn('font-medium text-text-primary', compact ? 'text-sm' : 'text-base')}>
        {title}
      </h3>
      {description && (
        <p
          className={cn(
            'text-text-secondary mt-2 max-w-md break-words',
            compact ? 'text-xs' : 'text-sm leading-relaxed',
          )}
        >
          {description}
        </p>
      )}
      {onRetry && (
        <div className="mt-6">
          <Button size={compact ? 'sm' : 'md'} variant="secondary" onClick={onRetry}>
            <RefreshCw className="h-4 w-4" aria-hidden="true" />
            <span>Try again</span>
          </Button>
        </div>
      )}
    </div>
  )
}
