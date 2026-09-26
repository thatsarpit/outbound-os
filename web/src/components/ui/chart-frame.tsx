import { useEffect, useRef, useState } from 'react'
import { cn } from '@/lib/utils'

export function ChartFrame({
  className,
  fallback,
  children,
}: {
  className?: string
  fallback: React.ReactNode
  children: React.ReactNode | ((size: { width: number; height: number }) => React.ReactNode)
}) {
  const containerRef = useRef<HTMLDivElement | null>(null)
  const [size, setSize] = useState({ width: 0, height: 0 })

  useEffect(() => {
    const node = containerRef.current
    if (!node) return

    const update = (width = node.clientWidth, height = node.clientHeight) => {
      setSize({
        width: Math.round(width),
        height: Math.round(height),
      })
    }

    update()

    if (typeof ResizeObserver === 'undefined') {
      return
    }

    const observer = new ResizeObserver((entries) => {
      const entry = entries[0]
      update(entry?.contentRect.width, entry?.contentRect.height)
    })

    observer.observe(node)
    return () => observer.disconnect()
  }, [])

  return (
    <div ref={containerRef} className={cn('min-w-0', className)}>
      {size.width > 0 && size.height > 0
        ? typeof children === 'function'
          ? children(size)
          : children
        : fallback}
    </div>
  )
}
