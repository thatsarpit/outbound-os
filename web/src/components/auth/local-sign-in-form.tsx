import { useState, type FormEvent } from 'react'
import { useLocation, useNavigate } from 'react-router-dom'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { signInWithPassword } from '@/components/auth/local-auth-bridge'
import { useAuthStore } from '@/stores/auth-store'

/** The built-in email + password form, used when the server's provider is `local`. */
export function LocalSignInForm() {
  const navigate = useNavigate()
  const location = useLocation()
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [pending, setPending] = useState(false)
  const [error, setError] = useState<string | null>(null)

  async function onSubmit(event: FormEvent) {
    event.preventDefault()
    setPending(true)
    setError(null)
    try {
      await signInWithPassword(email.trim(), password)
      const from = (location.state as { from?: { pathname?: string } } | null)?.from?.pathname
      navigate(from && from !== '/login' ? from : useAuthStore.getState().getHomeRoute(), {
        replace: true,
      })
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Sign-in failed. Try again.')
      setPending(false)
    }
  }

  return (
    <form onSubmit={onSubmit} className="flex flex-col gap-4" noValidate>
      <Input
        label="Work email"
        type="email"
        autoComplete="username"
        value={email}
        onChange={(event) => setEmail(event.target.value)}
        required
        autoFocus
      />
      <Input
        label="Password"
        type="password"
        autoComplete="current-password"
        value={password}
        onChange={(event) => setPassword(event.target.value)}
        required
      />
      {error && (
        <p role="alert" className="rounded-md border border-danger bg-danger-muted px-3 py-2 text-[13px] text-danger">
          {error}
        </p>
      )}
      <Button
        type="submit"
        pending={pending}
        pendingLabel="Signing in…"
        disabled={!email.trim() || !password}
      >
        Sign in
      </Button>
      <p className="text-[11px] leading-4 text-text-muted">
        Forgot your password? Ask a workspace admin to set a new one under Team, or run{' '}
        <code className="rounded bg-surface-raised px-1">npm run reset-password</code> on the server.
      </p>
    </form>
  )
}
