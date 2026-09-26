import { cn } from '@/lib/utils'

export function SkeletonLine({ className }: { className?: string }) {
  return <div className={cn('animate-shimmer rounded bg-surface-raised/60', className)} />
}

export function SkeletonCard({ className, lines = 3 }: { className?: string; lines?: number }) {
  return (
    <div className={cn('glass rounded-lg p-6 border border-border bg-surface/50', className)}>
      <div className="flex items-center gap-4 mb-6">
        <div className="h-12 w-12 rounded-md bg-surface-raised/60 animate-shimmer shrink-0" />
        <div className="space-y-2 flex-1">
          <SkeletonLine className="h-4 w-1/3" />
          <SkeletonLine className="h-3 w-1/4" />
        </div>
      </div>
      <div className="space-y-3">
        {Array.from({ length: lines }).map((_, i) => (
          <SkeletonLine key={i} className={cn('h-3', i === lines - 1 ? 'w-2/3' : 'w-full')} />
        ))}
      </div>
    </div>
  )
}

export function SkeletonTable({ rows = 5, className }: { rows?: number; className?: string }) {
  return (
    <div className={cn('glass rounded-lg overflow-hidden border border-border', className)}>
      <div className="border-b border-border bg-surface p-4 flex gap-4">
        <SkeletonLine className="h-4 w-8" />
        <SkeletonLine className="h-4 w-1/4" />
        <SkeletonLine className="h-4 w-1/4" />
        <SkeletonLine className="h-4 w-1/4" />
      </div>
      <div className="divide-y divide-border">
        {Array.from({ length: rows }).map((_, i) => (
          <div key={i} className="p-4 flex gap-4 items-center">
            <SkeletonLine className="h-4 w-4 rounded" />
            <SkeletonLine className="h-4 w-1/4" />
            <SkeletonLine className="h-4 w-1/4" />
            <SkeletonLine className="h-8 w-24 rounded-full" />
          </div>
        ))}
      </div>
    </div>
  )
}
