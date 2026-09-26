import { useMemo } from 'react'

/**
 * Theme-aware colors for Recharts.
 *
 * Reads the chart palette + semantic tokens from CSS variables defined in
 * web/src/styles/globals.css so the charts track the design system. If you
 * need a new color, add a `--color-chart-N` token in globals.css and pull
 * it through here — never hardcode hex in chart components.
 *
 * The dashboard is currently dark-only; when light-mode lands, switch this
 * hook to listen on a class/attribute on `documentElement` and re-resolve.
 */
function cssVar(name: string, fallback: string): string {
  if (typeof window === 'undefined') return fallback
  const v = getComputedStyle(document.documentElement).getPropertyValue(name).trim()
  return v || fallback
}

export function useChartTheme() {
  return useMemo(() => {
    const accent = cssVar('--color-accent', '#17171c')
    const success = cssVar('--color-success', accent)
    const warning = cssVar('--color-warning', '#f59e0b')
    const danger = cssVar('--color-danger', '#ef4444')
    const info = cssVar('--color-info', '#3b82f6')
    const surfaceRaised = cssVar('--color-surface-raised', '#f4f4f7')
    const border = cssVar('--color-border', '#e4e4ea')
    const textPrimary = cssVar('--color-text-primary', '#17171c')

    const c1 = cssVar('--color-chart-1', accent)
    const c2 = cssVar('--color-chart-2', warning)
    const c3 = cssVar('--color-chart-3', info)
    const c4 = cssVar('--color-chart-4', danger)
    const c5 = cssVar('--color-chart-5', '#a78bfa')
    const c6 = cssVar('--color-chart-6', '#22d3ee')
    const c7 = cssVar('--color-chart-7', '#db2777')
    const c8 = cssVar('--color-chart-8', '#f472b6')

    return {
      // Grid + axes
      grid: cssVar('--color-chart-grid', '#ededf1'),
      axis: cssVar('--color-chart-axis', '#85858f'),

      // Tooltip card
      tooltip: {
        backgroundColor: surfaceRaised,
        border: `1px solid ${border}`,
        borderRadius: '0.4375rem',
        fontSize: '0.8rem',
        color: textPrimary,
        boxShadow: 'var(--shadow-md)',
      } as React.CSSProperties,

      // Surface behind the plot. Used as the 2px ring on overlapping marks
      // (active dots, stacked segment gaps) so marks stay separable.
      tooltipSurface: cssVar('--color-surface', '#ffffff'),

      // Primary line/bar accent
      accent,
      // Derived from the chart palette so gradient fills follow the theme
      // instead of staying green.
      accentLight: `color-mix(in srgb, ${c1} 30%, transparent)`,
      accentNone: `color-mix(in srgb, ${c1} 0%, transparent)`,

      // Semantic
      success,
      warning,
      danger,
      info,

      // Donut by status — these map onto the semantic palette by intent.
      statusColors: {
        new: info,
        contacted: warning,
        replied: success,
        engaged: c7, // light green for distinction
        closed: accent,
        paused: danger,
        wa_unavailable: cssVar('--color-text-muted', '#71717a'),
      } as Record<string, string>,

      // Pipeline stage colors (same intent as statusColors above)
      pipelineColors: {
        new: info,
        contacted: warning,
        replied: success,
        engaged: c7,
        closed: accent,
      } as Record<string, string>,

      // Multi-series chart palette — pull from --color-chart-N tokens.
      // Slot order is validated for colour-vision separation; identify a
      // series by its slot, never by cycling past the end.
      palette: [c1, c2, c3, c4, c5, c6, c7, c8],

      /**
       * Sequential ramp for ORDERED data (funnel stages, buckets, intensity).
       * One hue, low contrast to high, mixed against the chart surface — which
       * keeps the direction of travel readable in both themes. Never use the
       * categorical palette for something that has an inherent order, and
       * never use the status colours as series colours.
       */
      sequential: (steps: number) =>
        Array.from({ length: steps }, (_, i) => {
          const pct = steps === 1 ? 100 : 30 + (i * 70) / (steps - 1)
          return `color-mix(in srgb, ${c1} ${pct.toFixed(0)}%, ${cssVar('--color-surface', '#ffffff')})`
        }),
    }
  }, [])
}
