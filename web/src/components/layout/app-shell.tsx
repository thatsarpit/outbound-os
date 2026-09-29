import { useCallback, useEffect, useRef, useState } from 'react'
import { Outlet, useLocation, useNavigate } from 'react-router-dom'
import { ErrorBoundary } from '@/components/error-boundary'
import { SystemHealthBanner } from './system-health-banner'
import { Sidebar } from './sidebar'
import { Topbar } from './topbar'
import { ShortcutsOverlay } from './shortcuts-overlay'
import { ToastContainer } from '@/components/ui/toast'
import { CommandPalette, useCommandPaletteHotkey } from '@/components/ui/command-palette'
import { useUIStore } from '@/stores/ui-store'
import { cn } from '@/lib/utils'
import { DemoWelcome, IS_DEMO } from '@/demo/demo-chrome'

/** `g` then a letter jumps between sections — the bindings the shortcuts
 *  overlay already advertises. useShortcuts only handles single keys plus
 *  modifiers, so the two-key sequence is tracked here. */
const NAV_SEQUENCES: Record<string, string> = {
  o: '/overview',
  i: '/inbox',
  l: '/leads',
  c: '/campaigns',
  p: '/pipeline',
  a: '/analytics',
}

function isTypingTarget(target: EventTarget | null): boolean {
  if (!(target instanceof HTMLElement)) return false
  const tag = target.tagName
  return tag === 'INPUT' || tag === 'TEXTAREA' || tag === 'SELECT' || target.isContentEditable
}

function useNavSequences() {
  const navigate = useNavigate()
  const armed = useRef(false)
  const timer = useRef<number | undefined>(undefined)

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.metaKey || e.ctrlKey || e.altKey || isTypingTarget(e.target)) return
      const key = e.key.toLowerCase()

      if (armed.current) {
        armed.current = false
        window.clearTimeout(timer.current)
        const route = NAV_SEQUENCES[key]
        if (route) {
          e.preventDefault()
          navigate(route)
        }
        return
      }

      if (key === 'g') {
        armed.current = true
        // Forget the prefix if the second key never arrives.
        timer.current = window.setTimeout(() => {
          armed.current = false
        }, 1200)
      }
    }

    window.addEventListener('keydown', onKey)
    return () => {
      window.removeEventListener('keydown', onKey)
      window.clearTimeout(timer.current)
    }
  }, [navigate])
}

export function AppShell() {
  const { sidebarCollapsed, isMobileViewport, setIsMobileViewport, setSidebarCollapsed } =
    useUIStore()
  const location = useLocation()
  const [paletteOpen, setPaletteOpen] = useState(false)

  const togglePalette = useCallback(() => setPaletteOpen((open) => !open), [])
  useCommandPaletteHotkey(togglePalette)
  useNavSequences()

  useEffect(() => {
    const media = window.matchMedia('(max-width: 1023px)')

    const syncViewport = (event?: MediaQueryList | MediaQueryListEvent) => {
      const matches = event?.matches ?? media.matches
      setIsMobileViewport(matches)
      setSidebarCollapsed(matches)
    }

    syncViewport(media)
    media.addEventListener('change', syncViewport)
    return () => media.removeEventListener('change', syncViewport)
  }, [setIsMobileViewport, setSidebarCollapsed])

  return (
    <div className="min-h-screen bg-background">
      {/* Deliberately no decorative background. Six blurred orbs, a green
          gradient wash and a grid overlay used to sit behind live data; a data
          surface needs a calm, flat ground. */}
      <Sidebar />

      {isMobileViewport && !sidebarCollapsed && (
        <button
          type="button"
          aria-label="Close navigation"
          onClick={() => setSidebarCollapsed(true)}
          className="fixed inset-0 z-30 bg-black/40 lg:hidden"
        />
      )}

      {/* The sidebar is fixed so it can act as a mobile drawer; this wrapper
          carries the matching inset on desktop. 60 = 240px, 14 = 56px rail. */}
      <div
        className={cn(
          'flex min-h-screen flex-col transition-[padding] duration-200 ease-out',
          sidebarCollapsed ? 'lg:pl-14' : 'lg:pl-60',
        )}
      >
        <Topbar onOpenSearch={togglePalette} />

        <main className="flex-1">
          <div className="mx-auto w-full max-w-[1600px] px-4 py-5 sm:px-6">
            {/* App-wide health banner — visible only when a subsystem is down or
                degraded (AI/email/WhatsApp/DB). Surfaces silent failures. */}
            <SystemHealthBanner />
            {/* Route-level error boundary. Keyed by pathname so a crash on one
                page (e.g. Campaigns) renders a recoverable inline error here
                instead of unmounting the whole app to a blank screen — and
                navigating to another route mounts a fresh boundary that clears
                the error automatically. */}
            <ErrorBoundary key={location.pathname}>
              <Outlet />
            </ErrorBoundary>
          </div>
        </main>
      </div>

      <ToastContainer />
      {IS_DEMO && <DemoWelcome />}
      <ShortcutsOverlay />
      <CommandPalette open={paletteOpen} onClose={() => setPaletteOpen(false)} />
    </div>
  )
}
