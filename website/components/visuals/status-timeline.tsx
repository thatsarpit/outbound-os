import { Check, Loader, Circle } from 'lucide-react'

/**
 * Roadmap as a state, not a wishlist.
 *
 * The value of a roadmap page is the honesty of its columns — a visitor needs
 * to know instantly what they can buy today versus what they would be waiting
 * for. Three states, three distinct marks, no ambiguity: a tick is shipped, a
 * half-ring is in progress, an outline is planned.
 */

export type Phase = 'now' | 'building' | 'planned'

const PHASE_META: Record<Phase, { label: string; icon: typeof Check; token: string }> = {
  now: { label: 'Available now', icon: Check, token: '--success' },
  building: { label: 'In development', icon: Loader, token: '--warning' },
  planned: { label: 'Planned', icon: Circle, token: '--text-muted' },
}

export function StatusTimeline({
  groups,
  className,
}: {
  groups: { phase: Phase; items: { title: string; detail: string }[] }[]
  className?: string
}) {
  return (
    <div className={['ledger', className].filter(Boolean).join(' ')}>
      {groups.map((group, gi) => {
        const meta = PHASE_META[group.phase]
        const Icon = meta.icon
        return (
          <section key={group.phase} className="ledger__group" style={{ '--i': gi } as React.CSSProperties}>
            <header className="ledger__head" style={{ color: `var(${meta.token})` }}>
              <span className="ledger__mark"><Icon size={13} strokeWidth={2.2} aria-hidden="true" /></span>
              <h3>{meta.label}</h3>
              <span className="ledger__n tabular">{group.items.length}</span>
            </header>
            <ul className="ledger__items">
              {group.items.map((item) => (
                <li key={item.title}>
                  <strong>{item.title}</strong>
                  <span>{item.detail}</span>
                </li>
              ))}
            </ul>
          </section>
        )
      })}
    </div>
  )
}
