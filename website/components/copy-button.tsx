'use client'

import { useState } from 'react'
import { Check, Copy } from 'lucide-react'

/** Copies text and says so. Falls back to selecting nothing, silently, where
    the clipboard is refused — the text is still on screen to copy by hand. */
export function CopyButton({ text, label = 'Copy', className }: { text: string; label?: string; className?: string }) {
  const [copied, setCopied] = useState(false)

  const copy = async () => {
    try {
      await navigator.clipboard.writeText(text)
      setCopied(true)
      window.setTimeout(() => setCopied(false), 1800)
    } catch {
      /* clipboard refused; the text remains selectable */
    }
  }

  return (
    <button type="button" className={['copy-btn', className].filter(Boolean).join(' ')} onClick={copy}>
      {copied ? <Check size={14} aria-hidden="true" /> : <Copy size={14} aria-hidden="true" />}
      <span aria-live="polite">{copied ? 'Copied' : label}</span>
    </button>
  )
}
