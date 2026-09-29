import { create } from 'zustand'

export type ToastType = 'success' | 'error' | 'info' | 'warning'

interface Toast {
  id: string
  type: ToastType
  message: string
  duration?: number
  createdAt: number
  closing?: boolean
}

interface ToastState {
  toasts: Toast[]
  addToast: (type: ToastType, message: string, duration?: number) => void
  dismissToast: (id: string) => void
  removeToast: (id: string) => void
}

const TOAST_EXIT_MS = 220

export const useToastStore = create<ToastState>((set) => ({
  toasts: [],

  addToast: (type, message, duration = 4000) => {
    const now = Date.now()
    const id = `${Date.now()}-${Math.random().toString(36).slice(2, 6)}`
    set((s) => {
      // One failure often reaches two handlers — the global one with the
      // server's message, and the page's own with "Could not save: " in front
      // of it. A toast that repeats one shown a moment ago adds nothing.
      const recentDuplicate = s.toasts.find(
        (toast) =>
          now - toast.createdAt < 2000 &&
          (toast.message.includes(message) || message.includes(toast.message)),
      )

      if (recentDuplicate) return s

      return {
        toasts: [
          ...s.toasts,
          { id, type, message, duration, createdAt: now, closing: false },
        ].slice(-4),
      }
    })

    if (duration > 0) {
      setTimeout(() => {
        useToastStore.getState().dismissToast(id)
      }, duration)
    }
  },

  dismissToast: (id) => {
    let shouldRemove = false

    set((s) => {
      const toast = s.toasts.find((item) => item.id === id)
      if (!toast || toast.closing) return s

      shouldRemove = true
      return {
        toasts: s.toasts.map((item) => (item.id === id ? { ...item, closing: true } : item)),
      }
    })

    if (shouldRemove) {
      window.setTimeout(() => {
        useToastStore.getState().removeToast(id)
      }, TOAST_EXIT_MS)
    }
  },

  removeToast: (id) => set((s) => ({ toasts: s.toasts.filter((t) => t.id !== id) })),
}))

/** Shorthand helpers */
export const toast = {
  success: (msg: string) => useToastStore.getState().addToast('success', msg),
  error: (msg: string) => useToastStore.getState().addToast('error', msg, 6000),
  info: (msg: string) => useToastStore.getState().addToast('info', msg),
  warning: (msg: string) => useToastStore.getState().addToast('warning', msg),
}
