import { Check, Minus } from 'lucide-react'

/**
 * Security controls, stated as implemented or not.
 *
 * A security page that lists only what exists reads as evasive to the people
 * who actually review it — their first question is what is missing. Showing
 * both columns in one matrix answers that before they ask, which is the
 * fastest way to be believed about the first column.
 */

const CONTROLS: { label: string; detail: string; state: 'yes' | 'no' }[] = [
  { label: 'Role-based access', detail: 'Admin, manager, agent and viewer.', state: 'yes' },
  { label: 'Data scoping', detail: 'Lead pools limit which records a user sees.', state: 'yes' },
  { label: 'Credential encryption', detail: 'Channel credentials encrypted at rest (AES-256-GCM).', state: 'yes' },
  { label: 'Authenticated webhooks', detail: 'Per-source keys; provider signatures and secrets checked.', state: 'yes' },
  { label: 'Open source', detail: 'Every control can be read and audited on GitHub.', state: 'yes' },
  { label: 'SOC 2 / ISO 27001', detail: 'Not certified. No audit has been carried out.', state: 'no' },
  { label: 'Third-party penetration test', detail: 'Not yet commissioned.', state: 'no' },
]

export function ControlsMatrix({ className }: { className?: string }) {
  return (
    <ul className={['matrix', className].filter(Boolean).join(' ')}>
      {CONTROLS.map((c, i) => (
        <li key={c.label} className="matrix__row" data-state={c.state} style={{ '--i': i } as React.CSSProperties}>
          <span className="matrix__mark">
            {c.state === 'yes'
              ? <Check size={13} strokeWidth={2.4} aria-hidden="true" />
              : <Minus size={13} strokeWidth={2.4} aria-hidden="true" />}
          </span>
          <span className="matrix__body">
            <strong>{c.label}</strong>
            <span>{c.detail}</span>
          </span>
          <span className="matrix__state">{c.state === 'yes' ? 'In place' : 'Not yet'}</span>
        </li>
      ))}
    </ul>
  )
}
