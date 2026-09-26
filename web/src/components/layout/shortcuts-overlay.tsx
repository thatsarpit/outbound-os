import { useState } from 'react'
import { Dialog, DialogContent } from '@/components/ui/dialog'
import { useShortcuts } from '@/hooks/use-shortcuts'

/**
 * Global keyboard-shortcut overlay. Press `?` anywhere to open it. Lists the
 * shortcuts that are always available; page-local bindings are listed by the
 * pages that own them.
 *
 * If you add a new app-wide shortcut, add it to GLOBAL_SHORTCUTS below so the
 * overlay stays the source of truth users can discover.
 */

type ShortcutRow = { keys: string[]; description: string }
type ShortcutSection = { title: string; items: ShortcutRow[] }

const GLOBAL_SHORTCUTS: ShortcutSection[] = [
  {
    title: 'Global',
    items: [
      { keys: ['?'], description: 'Show this shortcuts overlay' },
      { keys: ['Esc'], description: 'Close any open drawer, modal, or overlay' },
      { keys: ['/'], description: 'Focus the search input on the current page' },
      { keys: ['⌘', 'S'], description: 'Save the current form (where applicable)' },
    ],
  },
  {
    title: 'Navigation',
    items: [
      { keys: ['g', 'o'], description: 'Go to Overview' },
      { keys: ['g', 'i'], description: 'Go to Inbox' },
      { keys: ['g', 'l'], description: 'Go to Leads' },
      { keys: ['g', 'c'], description: 'Go to Campaigns' },
    ],
  },
]

export function ShortcutsOverlay() {
  const [open, setOpen] = useState(false)
  useShortcuts({
    '?': () => setOpen(true),
    'shift+?': () => setOpen(true), // ? typically requires shift on US layouts
  })

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogContent size="md">
        <div className="px-6 pt-6">
          <h2 className="text-lg font-semibold tracking-tight">Keyboard shortcuts</h2>
          <p className="mt-1 text-sm text-text-secondary">
            Speed up your workflow. Press <Kbd>Esc</Kbd> to close.
          </p>
        </div>
        <div className="space-y-6 px-6 pb-6 pt-4">
          {GLOBAL_SHORTCUTS.map((section) => (
            <section key={section.title}>
              <h3 className="text-sm font-semibold uppercase tracking-wide text-text-muted">
                {section.title}
              </h3>
              <ul className="mt-3 space-y-2">
                {section.items.map((row) => (
                  <li
                    key={row.description}
                    className="flex items-center justify-between gap-4 text-sm"
                  >
                    <span className="text-text-secondary">{row.description}</span>
                    <span className="flex items-center gap-1">
                      {row.keys.map((k, i) => (
                        <Kbd key={i}>{k}</Kbd>
                      ))}
                    </span>
                  </li>
                ))}
              </ul>
            </section>
          ))}
        </div>
      </DialogContent>
    </Dialog>
  )
}

function Kbd({ children }: { children: React.ReactNode }) {
  return (
    <kbd className="inline-flex h-6 min-w-6 items-center justify-center rounded-md border border-border bg-surface-raised px-1.5 font-mono text-[11px] font-medium text-text-secondary shadow-sm">
      {children}
    </kbd>
  )
}
