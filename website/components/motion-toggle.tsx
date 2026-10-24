'use client'

import { useSyncExternalStore } from 'react'
import { Pause, Play } from 'lucide-react'

const preferenceKey = 'outboundos:site-motion:v1'
const preferenceEvent = 'outboundos:site-motion-change'

function subscribe(notify: () => void) {
  const media = window.matchMedia('(prefers-reduced-motion: reduce)')
  const syncStorage = () => {
    try {
      document.documentElement.dataset.motion = localStorage.getItem(preferenceKey) === 'off' ? 'off' : 'on'
    } catch { /* The controls still work when storage is unavailable. */ }
    notify()
  }
  window.addEventListener(preferenceEvent, notify)
  window.addEventListener('storage', syncStorage)
  media.addEventListener('change', notify)
  syncStorage()
  return () => {
    window.removeEventListener(preferenceEvent, notify)
    window.removeEventListener('storage', syncStorage)
    media.removeEventListener('change', notify)
  }
}

function snapshot() {
  if (window.matchMedia('(prefers-reduced-motion: reduce)').matches) return 'reduced'
  return document.documentElement.dataset.motion === 'off' ? 'paused' : 'on'
}

export function useMotionPreference() {
  return useSyncExternalStore(subscribe, snapshot, () => 'on')
}

/** Every instance reflects the same preference, including across navigation. */
export function MotionToggle() {
  const mode = useMotionPreference()
  const paused = mode !== 'on'
  return (
    <button
      type="button"
      className="motion-toggle"
      aria-pressed={paused}
      disabled={mode === 'reduced'}
      onClick={() => {
        const value = paused ? 'on' : 'off'
        document.documentElement.dataset.motion = value
        try { localStorage.setItem(preferenceKey, value) } catch { /* Optional persistence. */ }
        window.dispatchEvent(new Event(preferenceEvent))
      }}
    >
      {paused ? <Play size={12} aria-hidden="true" /> : <Pause size={12} aria-hidden="true" />}
      {mode === 'reduced' ? 'Reduced motion' : paused ? 'Resume motion' : 'Pause motion'}
    </button>
  )
}
