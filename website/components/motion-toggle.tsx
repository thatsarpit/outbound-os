'use client'

import { useState } from 'react'

/** A visible pause control also stops older explanatory SVG/CSS loops. */
export function MotionToggle() {
  const [paused, setPaused] = useState(false)
  return (
    <button
      type="button"
      className="motion-toggle"
      aria-pressed={paused}
      onClick={() => {
        document.documentElement.dataset.motion = paused ? 'on' : 'off'
        setPaused(!paused)
      }}
    >
      {paused ? 'Resume animations' : 'Pause animations'}
    </button>
  )
}
