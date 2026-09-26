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
      const recentDuplicate = s.toasts.find(
        (toast) => toast.type === type && toast.message === message && now - toast.createdAt < 2000,
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
