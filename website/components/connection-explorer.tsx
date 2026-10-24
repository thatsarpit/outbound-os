'use client'

import { useId, useState, type KeyboardEvent, type ReactNode } from 'react'
import Link from 'next/link'
import { ArrowRight, Check, GitMerge, UserRound } from 'lucide-react'

type Source = { label: string; icon: ReactNode; href: string; detail: string; kind: string }

/** The map explains configurable routes; it never claims to be a live connection. */
export function ConnectionExplorer({ sources, channels, outputs }: { sources: Source[]; channels: ReactNode; outputs: ReactNode }) {
  const [selected, setSelected] = useState(0)
  const base = useId()
  const source = sources[selected]
  const move = (event: KeyboardEvent<HTMLButtonElement>, index: number) => {
    const next = event.key === 'ArrowDown' ? (index + 1) % sources.length
      : event.key === 'ArrowUp' ? (index + sources.length - 1) % sources.length
      : event.key === 'Home' ? 0 : event.key === 'End' ? sources.length - 1 : null
    if (next === null) return
    event.preventDefault()
    setSelected(next)
    document.getElementById(`${base}-source-${next}`)?.focus()
  }
  return (
    <div className="connection-map">
      <div className="connection-map__head"><span>Connection map</span><span>Choose a source to explore the route</span></div>
      <div className="connection-map__body">
        <div className="connection-map__sources">
          <p className="connection-map__label"><span>01</span> Bring the enquiry in</p>
          <div role="tablist" aria-label="Enquiry sources" aria-orientation="vertical">
            {sources.map((item, index) => (
              <button type="button" key={item.label} role="tab" id={`${base}-source-${index}`}
                aria-selected={index === selected} aria-controls={`${base}-record`} tabIndex={index === selected ? 0 : -1}
                onClick={() => setSelected(index)} onKeyDown={(event) => move(event,index)}>
                {item.icon}<span>{item.label}<small>{item.kind}</small></span><ArrowRight size={14} aria-hidden="true" />
              </button>
            ))}
          </div>
        </div>
        <div className="connection-map__record" role="tabpanel" id={`${base}-record`} aria-labelledby={`${base}-source-${selected}`} tabIndex={0}>
          <p className="connection-map__label"><span>02</span> Keep the customer together</p>
          <div className="connection-record" key={source.label}>
            <div className="connection-record__source">{source.icon}<span>{source.label}</span><Check size={12} /></div>
            <div className="connection-record__person"><span><UserRound size={19} /></span><div><strong>Rohan Mehta</strong><small>Meridian Distributors</small></div></div>
            <dl><div><dt>Enquiry</dt><dd>M8 hex bolts · 20,000 units</dd></div><div><dt>Context</dt><dd>Source, contact details and message history</dd></div></dl>
            <p><GitMerge size={14} /> Match repeat enquiries to the same lead</p>
          </div>
          <small className="connection-map__example">Example record · not a live customer</small>
        </div>
        <div className="connection-map__channels">
          <p className="connection-map__label"><span>03</span> Continue the conversation</p>
          {channels}
          <p className="connection-map__rules">Your connected accounts, consent and provider rules determine what can send.</p>
        </div>
      </div>
      <div className="connection-map__detail"><p>{source.detail}</p><Link href={source.href}>Set up {source.label.toLowerCase()} <ArrowRight size={14} /></Link></div>
      <div className="connection-map__outputs"><span>And connect the rest of your work</span>{outputs}</div>
    </div>
  )
}
