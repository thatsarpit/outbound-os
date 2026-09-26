import { useEffect } from 'react'
import { readLocalSession, useAuthStore } from '@/stores/auth-store'

type SessionUser = { id: number | string; name: string; email: string; role: string }

/**
 * Restores a built-in sign-in session on page load. The token lives in this
 * browser; the server is asked who it belongs to, so a disabled account or a
 * changed role is picked up straight away.
 *
 * Mount once, above the router, when the server's provider is `local`.
 */
export function LocalAuthBridge() {
  useEffect(() => {
    const { setFromLocal } = useAuthStore.getState()
    const token = readLocalSession()
    if (!token) {
      setFromLocal(null)
      return
    }
    let cancelled = false
    fetch('/api/auth/me', { headers: { Authorization: `Bearer ${token}` } })
      .then(async (response) => {
        if (cancelled) return
        if (!response.ok) {
          setFromLocal(null)
          return
        }
        const body = (await response.json()) as { user?: SessionUser | null }
        setFromLocal(body.user ? { user: body.user, token } : null)
      })
      .catch(() => {
        if (!cancelled) setFromLocal(null)
      })
    return () => {
      cancelled = true
    }
  }, [])

  return null
}

/** POST /api/auth/login, then start the session. Throws with the server's message. */
export async function signInWithPassword(email: string, password: string): Promise<void> {
  const response = await fetch('/api/auth/login', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', Accept: 'application/json' },
    body: JSON.stringify({ email, password }),
  })
  const body = (await response.json().catch(() => ({}))) as {
    token?: string
    user?: SessionUser
    error?: string
  }
  if (!response.ok || !body.token || !body.user) {
    throw new Error(body.error || 'Sign-in failed. Try again.')
  }
  useAuthStore.getState().setFromLocal({ user: body.user, token: body.token })
}
