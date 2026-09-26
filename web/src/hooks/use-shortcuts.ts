import { useEffect } from 'react'

/**
 * Lightweight keyboard-shortcut hook.
 *
 *   useShortcuts({
 * '/': () => searchRef.current?.focus(),
 * 'mod+s': () => save(),
 * '?': () => setShowShortcuts(true),
 *   })
 *
 * Key syntax:
 *   - Plain characters: `/`, `?`, `n`, `Escape`, `Enter`
 *   - Modifiers (combine with `+`): `mod` (cmd on mac, ctrl elsewhere),
 *     `ctrl`, `shift`, `alt`
 *   - Examples: `mod+s`, `mod+shift+k`, `shift+?`
 *
 * Skips firing when the user is typing in an input/textarea/contenteditable
 * UNLESS the binding includes a modifier. (So `n` won't capture typing, but
 * `mod+s` still works inside a textarea — which is what you want.)
 *
 * Returning `false` from a handler lets the event continue (e.g. to allow
 * the browser default). Returning `undefined` or anything else stops it.
 */
export type ShortcutHandler = (e: KeyboardEvent) => void | boolean
export type ShortcutMap = Record<string, ShortcutHandler>

function isMac(): boolean {
  if (typeof navigator === 'undefined') return false
  return /Mac|iPod|iPhone|iPad/.test(navigator.platform)
}

function isTypingTarget(target: EventTarget | null): boolean {
  if (!(target instanceof HTMLElement)) return false
  const tag = target.tagName
  if (tag === 'INPUT' || tag === 'TEXTAREA' || tag === 'SELECT') return true
  if (target.isContentEditable) return true
  return false
}

function eventMatches(e: KeyboardEvent, binding: string): boolean {
  const parts = binding
    .toLowerCase()
    .split('+')
    .map((p) => p.trim())
    .filter(Boolean)
  if (parts.length === 0) return false
  const key = parts[parts.length - 1]
  const mods = new Set(parts.slice(0, -1))

  // Translate the platform-aware `mod` modifier
  const wantMeta = mods.has('mod') ? isMac() : mods.has('meta') || mods.has('cmd')
  const wantCtrl = mods.has('mod') ? !isMac() : mods.has('ctrl')
  const wantShift = mods.has('shift')
  const wantAlt = mods.has('alt')

  if (!!e.metaKey !== !!wantMeta) return false
  if (!!e.ctrlKey !== !!wantCtrl) return false
  if (!!e.shiftKey !== !!wantShift) return false
  if (!!e.altKey !== !!wantAlt) return false

  // Some keys live in `e.key` lowercased (e.g. 's'); others arrive as named
  // codes (`Escape`, `Enter`). Compare lowercase to lowercase.
  return e.key.toLowerCase() === key
}

export function useShortcuts(map: ShortcutMap, enabled = true): void {
  useEffect(() => {
    if (!enabled) return
    const onKey = (e: KeyboardEvent) => {
      for (const [binding, handler] of Object.entries(map)) {
        if (!eventMatches(e, binding)) continue
        // For single-char bindings with no modifier, skip when typing in a form
        const hasModifier = binding.includes('+')
        if (!hasModifier && isTypingTarget(e.target)) continue
        const result = handler(e)
        // Default: prevent + stop; return false to let it through
        if (result !== false) {
          e.preventDefault()
          e.stopPropagation()
        }
        return
      }
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [enabled, ...Object.keys(map), ...Object.values(map)])
}
