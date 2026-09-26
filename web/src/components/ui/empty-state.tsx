import { cn } from '@/lib/utils'
import { LucideIcon } from 'lucide-react'
import React from 'react'

/**
 * EmptyState — canonical zero-data UI.
 *
 * Pick a `tone` so the empty doesn't feel generic. Each tone tweaks the border
 * + icon colour to communicate *why* this is empty:
 *
 *   tone="waiting"       (default) Waiting for data to arrive — neutral.
 *   tone="filtered"      User filtered too narrowly — warm. Suggest widening.
 *   tone="unconfigured"  Needs setup before anything can appear here — info.
 *
 * Always pass a useful `action` (CTA Button) when an action makes sense.
 */
export type EmptyStateTone = 'waiting' | 'filtered' | 'unconfigured'

const TONE_STYLES: Record<EmptyStateTone, { border: string; iconBg: string; iconColor: string }> = {
  waiting: {
    border: 'border-dashed border-border bg-surface-raised/30',
    iconBg: 'bg-surface',
    iconColor: 'text-text-muted',
  },
  filtered: {
    border: 'border-dashed border-warning/40 bg-warning-muted/20',
    iconBg: 'bg-warning-muted',
    iconColor: 'text-warning',
  },
  unconfigured: {
    border: 'border-dashed border-info/40 bg-info-muted/20',
    iconBg: 'bg-info-muted',
    iconColor: 'text-info',
  },
}

export function EmptyState({
  icon: Icon,
  title,
  description,
  action,
  tone = 'waiting',
  compact = false,
  className,
}: {
  icon: LucideIcon | React.ElementType
  title: string
  description: string
  action?: React.ReactNode
  tone?: EmptyStateTone
  compact?: boolean
  className?: string
}) {
  const styles = TONE_STYLES[tone]
  return (
    <div
      className={cn(
        'flex flex-col items-center justify-center text-center rounded-lg border animate-fade-in',
        compact ? 'p-6' : 'py-16 px-6',
        styles.border,
        className,
      )}
    >
      <div
        className={cn(
          'flex items-center justify-center rounded-full mb-4 border border-border',
          compact ? 'h-12 w-12' : 'h-16 w-16',
          styles.iconBg,
        )}
      >
        <Icon className={cn(styles.iconColor, compact ? 'h-5 w-5' : 'h-7 w-7')} />
      </div>
      <h3 className={cn('font-medium text-text-primary', compact ? 'text-sm' : 'text-base')}>
        {title}
      </h3>
      <p
        className={cn(
          'text-text-secondary mt-2 max-w-sm',
          compact ? 'text-xs' : 'text-sm leading-relaxed',
        )}
      >
        {description}
      </p>
      {action && <div className="mt-6">{action}</div>}
    </div>
  )
}
