import { create } from 'zustand'

/**
 * Theme has three states, not two:
 * 'light' / 'dark' — an explicit choice, stamped onto <html data-theme>
 * 'system'         — no stamp, so the prefers-color-scheme media query in
 *                      globals.css decides. This is the default.
 *
 * The previous implementation toggled a `.dark` class that no CSS rule
 * anywhere consumed, so the toggle was a visible no-op and light mode never
 * existed. Tokens now live on `:root` (light) with overrides under both
 * `@media (prefers-color-scheme: dark)` and `:root[data-theme="dark"]`.
 */
export type Theme = 'light' | 'dark' | 'system'

const THEME_KEY = 'outboundos_theme'

/** Kept so we can migrate anyone still holding the old key. */
const LEGACY_THEME_KEY = 'medsales_theme_v2'

function readStoredTheme(): Theme {
  if (typeof window === 'undefined') return 'system'
  try {
    const stored = localStorage.getItem(THEME_KEY)
    if (stored === 'light' || stored === 'dark' || stored === 'system') return stored

    const legacy = localStorage.getItem(LEGACY_THEME_KEY)
    if (legacy === 'light' || legacy === 'dark') return legacy
  } catch {
    // Private browsing / blocked storage — fall through to system.
  }
  return 'system'
}

export function applyTheme(theme: Theme) {
  if (typeof document === 'undefined') return
  const root = document.documentElement

  if (theme === 'system') {
    root.removeAttribute('data-theme')
  } else {
    root.setAttribute('data-theme', theme)
  }

  try {
    localStorage.setItem(THEME_KEY, theme)
    localStorage.removeItem(LEGACY_THEME_KEY)
  } catch {
    // Non-fatal: the theme still applies for this session.
  }
}

/** What the user is actually looking at right now. */
export function resolveTheme(theme: Theme): 'light' | 'dark' {
  if (theme !== 'system') return theme
  if (typeof window === 'undefined') return 'light'
  return window.matchMedia('(prefers-color-scheme: dark)').matches ? 'dark' : 'light'
}

interface UIState {
  sidebarCollapsed: boolean
  isMobileViewport: boolean
  theme: Theme
  toggleSidebar: () => void
  setSidebarCollapsed: (collapsed: boolean) => void
  setIsMobileViewport: (isMobile: boolean) => void
  toggleTheme: () => void
  setTheme: (theme: Theme) => void
}

export const useUIStore = create<UIState>((set, get) => {
  const initial = readStoredTheme()
  const initialIsMobileViewport = typeof window !== 'undefined' ? window.innerWidth < 1024 : false

  if (typeof window !== 'undefined') {
    applyTheme(initial)
  }

  return {
    sidebarCollapsed: initialIsMobileViewport,
    isMobileViewport: initialIsMobileViewport,
    theme: initial,
    toggleSidebar: () => set((s) => ({ sidebarCollapsed: !s.sidebarCollapsed })),
    setSidebarCollapsed: (collapsed: boolean) => set({ sidebarCollapsed: collapsed }),
    setIsMobileViewport: (isMobile: boolean) => set({ isMobileViewport: isMobile }),
    /** Flips to the opposite of what is currently on screen. */
    toggleTheme: () => {
      const next: Theme = resolveTheme(get().theme) === 'dark' ? 'light' : 'dark'
      applyTheme(next)
      set({ theme: next })
    },
    setTheme: (theme: Theme) => {
      applyTheme(theme)
      set({ theme })
    },
  }
})
