import { ClerkSignIn } from '@/components/auth/clerk-sign-in'
import { LocalSignInForm } from '@/components/auth/local-sign-in-form'
import { useAuthStore } from '@/stores/auth-store'
import { LockKeyhole } from 'lucide-react'
import { BrandMark } from '@/components/layout/brand-mark'
import { BRAND_TAGLINE } from '@/lib/branding'

/**
 * One card for both sign-in systems: the built-in email + password form, or
 * Clerk's email-code widget. Nesting Clerk's fixed-width card inside a padded
 * app card made the widget overflow, so the card itself is the frame.
 */
export default function LoginPage() {
  const provider = useAuthStore((state) => state.provider)
  return (
    <main className="relative flex min-h-screen items-center justify-center overflow-hidden bg-background px-4 py-10 sm:px-6">
      <div
        aria-hidden="true"
        className="pointer-events-none absolute inset-0 opacity-45 [background-image:linear-gradient(to_right,var(--color-border-subtle)_1px,transparent_1px),linear-gradient(to_bottom,var(--color-border-subtle)_1px,transparent_1px)] [background-size:32px_32px] [mask-image:radial-gradient(ellipse_at_center,black,transparent_72%)]"
      />

      <section className="relative w-full max-w-[440px] animate-slide-up">
        <div className="overflow-hidden rounded-lg border border-border bg-surface shadow-md">
          <header className="border-b border-border-subtle px-6 pb-5 pt-6 sm:px-8 sm:pt-8">
            <div className="flex items-center gap-3">
              <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-md bg-accent text-accent-fg">
                <BrandMark className="h-6 w-6" />
              </div>
              <div>
                <p className="text-sm font-semibold tracking-tight text-text-primary">Outbound OS</p>
                <p className="mt-0.5 text-[12px] text-text-muted">{BRAND_TAGLINE}</p>
              </div>
            </div>
            <h1 className="mt-7 text-2xl font-semibold tracking-tight text-text-primary">Welcome back</h1>
            <p className="mt-1.5 text-[13px] leading-5 text-text-secondary">
              {provider === 'clerk'
                ? 'Enter your work email and we’ll send you a one-time code.'
                : 'Sign in with your work email and password.'}
            </p>
          </header>

          <div className="px-6 py-6 sm:px-8">
          {provider === 'clerk' ? <ClerkSignIn /> : <LocalSignInForm />}

            <div className="mt-5 flex items-center justify-center gap-1.5 border-t border-border-subtle pt-5 text-[11px] text-text-muted">
              <LockKeyhole className="h-3 w-3" aria-hidden="true" />
              <span>{provider === 'clerk' ? 'Secure passwordless sign-in' : 'Encrypted connection · failed attempts are rate-limited'}</span>
            </div>
          </div>
        </div>
        <p className="mt-4 text-center text-[11px] text-text-muted">
          {provider === 'clerk'
            ? 'Access is limited to invited workspace members.'
            : 'Accounts are created by your workspace admin.'}
        </p>
      </section>
    </main>
  )
}
