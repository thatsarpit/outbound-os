import { useEffect } from 'react'

/** Keep the installed sales app at its layout scale; Safari pages retain normal browser zoom. */
export function useInstalledViewport() {
  useEffect(() => {
    const installed =
      matchMedia('(display-mode: standalone)').matches ||
      Boolean((navigator as Navigator & { standalone?: boolean }).standalone)
    if (!installed) return
    const viewport = document.querySelector('meta[name="viewport"]')
    const previous = viewport?.getAttribute('content')
    viewport?.setAttribute(
      'content',
      'width=device-width, initial-scale=1, maximum-scale=1, user-scalable=no, viewport-fit=cover',
    )
    const preventGesture = (event: Event) => {
      if (event.cancelable) event.preventDefault()
    }
    const preventPinch = (event: TouchEvent) => {
      if (event.touches.length > 1 && event.cancelable) event.preventDefault()
    }
    document.addEventListener('gesturestart', preventGesture, { passive: false })
    document.addEventListener('gesturechange', preventGesture, { passive: false })
    document.addEventListener('touchmove', preventPinch, { passive: false })
    return () => {
      if (previous) viewport?.setAttribute('content', previous)
      document.removeEventListener('gesturestart', preventGesture)
      document.removeEventListener('gesturechange', preventGesture)
      document.removeEventListener('touchmove', preventPinch)
    }
  }, [])
}
