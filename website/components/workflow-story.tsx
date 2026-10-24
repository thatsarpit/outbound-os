'use client'

import { useId, useState, type KeyboardEvent, type ReactNode } from 'react'
import { ArrowRight } from 'lucide-react'

type Step = { label: string; title: string; text: string; visual: ReactNode }

/** A finite, visitor-controlled sequence; the pictures arrive as server nodes. */
export function WorkflowStory({ steps }: { steps: Step[] }) {
  const [active, setActive] = useState(0)
  const id = useId()
  const move = (event: KeyboardEvent<HTMLButtonElement>, index: number) => {
    const next = event.key === 'ArrowRight' ? (index + 1) % steps.length
      : event.key === 'ArrowLeft' ? (index + steps.length - 1) % steps.length
      : event.key === 'Home' ? 0 : event.key === 'End' ? steps.length - 1 : null
    if (next === null) return
    event.preventDefault()
    setActive(next)
    document.getElementById(`${id}-step-${next}`)?.focus()
  }
  return (
    <div className="journey">
      <div className="journey__steps" role="tablist" aria-label="Follow a customer conversation">
        {steps.map((step, index) => (
          <button key={step.label} type="button" role="tab" id={`${id}-step-${index}`}
            aria-selected={active === index} aria-controls={`${id}-panel-${index}`}
            tabIndex={active === index ? 0 : -1} onClick={() => setActive(index)} onKeyDown={(event) => move(event, index)}>
            <span className="journey__number">0{index + 1}</span>
            <span>{step.label}</span><ArrowRight size={16} aria-hidden="true" />
          </button>
        ))}
      </div>
      {steps.map((step, index) => (
        <div key={step.label} role="tabpanel" id={`${id}-panel-${index}`} aria-labelledby={`${id}-step-${index}`}
          hidden={active !== index} className="journey__panel" tabIndex={0}>
          <div className="journey__copy"><p className="eyebrow">One customer. A connected workflow.</p><h3>{step.title}</h3><p>{step.text}</p>
            <span className="journey__note">Workflow illustration · sample records</span>
          </div>
          <div className="journey__visual">{step.visual}</div>
        </div>
      ))}
    </div>
  )
}
