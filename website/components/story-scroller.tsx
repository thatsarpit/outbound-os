'use client'

import { useEffect, useRef, useState, type ReactNode } from 'react'

/**
 * A scroll-told sequence: steps scroll past on the left while one sticky
 * panel on the right shows the picture for whichever step is in the middle
 * of the screen. On narrow screens each picture sits under its own step.
 *
 * Pictures arrive as server-rendered nodes, so logos and markup stay out of
 * the client bundle; this component only decides which one is active.
 */
/* `visual` and `inline` must be separate renders of the same picture: logo
   drawings carry gradient ids, and a copy that is display:none cannot supply
   the gradients for one that is showing. */
export type Story = { eyebrow: string; title: string; body: ReactNode; visual: ReactNode; inline: ReactNode }

export function StoryScroller({ steps }: { steps: Story[] }) {
  const [active, setActive] = useState(0)
  const refs = useRef<(HTMLLIElement | null)[]>([])

  useEffect(() => {
    const observer = new IntersectionObserver(
      (entries) => {
        for (const entry of entries) {
          if (entry.isIntersecting) setActive(Number((entry.target as HTMLElement).dataset.index))
        }
      },
      { rootMargin: '-45% 0px -45% 0px' },
    )
    refs.current.forEach((el) => el && observer.observe(el))
    return () => observer.disconnect()
  }, [])

  return (
    <div className="story">
      <ol className="story__steps">
        {steps.map((step, index) => (
          <li
            key={step.title}
            ref={(el) => {
              refs.current[index] = el
            }}
            data-index={index}
            className="story__step"
            data-active={index === active ? 'true' : undefined}
          >
            <p>
              <span className="story__num tabular">{String(index + 1).padStart(2, '0')}</span>
              <span className="story__eyebrow">{step.eyebrow}</span>
            </p>
            <h3>{step.title}</h3>
            <div className="story__body">{step.body}</div>
            <div className="story__inline" aria-hidden="true">
              {step.inline}
            </div>
          </li>
        ))}
      </ol>

      <div className="story__stage" aria-hidden="true">
        <div className="story__frame">
          {steps.map((step, index) => (
            <div key={step.title} className="story__visual" data-active={index === active ? 'true' : undefined}>
              {step.visual}
            </div>
          ))}
          <div className="story__dots">
            {steps.map((step, index) => (
              <i key={step.title} data-active={index === active ? 'true' : undefined} />
            ))}
          </div>
        </div>
      </div>
    </div>
  )
}
