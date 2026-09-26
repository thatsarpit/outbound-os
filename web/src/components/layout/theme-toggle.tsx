import { useEffect, useState } from 'react'
import { Moon, Sun } from 'lucide-react'
import { useUIStore, resolveTheme } from '@/stores/ui-store'
import { cn } from '@/lib/utils'

type ThemeToggleProps = {
  className?: string
}

export function ThemeToggle({ className }: ThemeToggleProps) {
  const { theme, toggleTheme } = useUIStore()

  // `theme` may be 'system', so what is actually on screen depends on the OS
  // setting. Track it in state and follow the media query while it is 'system'.
  const [resolved, setResolved] = useState(() => resolveTheme(theme))

  useEffect(() => {
    setResolved(resolveTheme(theme))
    if (theme !== 'system') return

    const media = window.matchMedia('(prefers-color-scheme: dark)')
    const sync = () => setResolved(resolveTheme('system'))
    media.addEventListener('change', sync)
    return () => media.removeEventListener('change', sync)
  }, [theme])

  const isDark = resolved === 'dark'
  const label = isDark ? 'Switch to light mode' : 'Switch to dark mode'

  return (
    <button
      type="button"
      onClick={toggleTheme}
      aria-label={label}
      title={label}
      className={cn(
        'inline-flex h-9 w-9 items-center justify-center rounded-md border border-border bg-surface text-text-muted transition-colors hover:bg-surface-raised hover:text-text-primary',
        className,
      )}
    >
      {isDark ? (
        <Sun aria-hidden="true" className="h-4 w-4" />
      ) : (
        <Moon aria-hidden="true" className="h-4 w-4" />
      )}
    </button>
  )
}
