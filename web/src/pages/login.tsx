import type { CSSProperties } from 'react'
import { ArrowRight, ArrowUpRight, Check, Inbox, LockKeyhole, MessageSquare } from 'lucide-react'
import { ClerkSignIn } from '@/components/auth/clerk-sign-in'
import { LocalSignInForm } from '@/components/auth/local-sign-in-form'
import { BrandMark } from '@/components/layout/brand-mark'
import { SUPPORT_URL } from '@/lib/branding'
import { useAuthStore } from '@/stores/auth-store'

// Keep the entry screen dark without changing the saved dashboard appearance.
const LOGIN_THEME = {
  colorScheme: 'dark',
  '--color-background': '#0b0b0e',
  '--color-surface': '#141419',
  '--color-surface-raised': '#1c1c22',
  '--color-border': '#26262e',
  '--color-border-subtle': '#1a1a20',
  '--color-border-strong': '#383842',
  '--color-text-primary': '#f7f7f9',
  '--color-text-secondary': '#a0a0ac',
  '--color-text-muted': '#81818e',
  '--color-accent': '#f7f7f9',
  '--color-accent-hover': '#ffffff',
  '--color-accent-fg': '#17171c',
  '--color-focus': '#8b99ff',
  '--color-focus-muted': '#191a33',
  '--color-danger': '#f87171',
  '--color-danger-muted': '#2c171b',
} as CSSProperties

export default function LoginPage() {
  const provider = useAuthStore((state) => state.provider)

  return (
    <main
      style={LOGIN_THEME}
      className="relative isolate flex min-h-dvh flex-col bg-background text-text-primary"
    >
      <header className="relative z-10 flex items-center justify-between gap-4 border-b border-border-subtle px-6 pb-5 pt-[max(1.25rem,env(safe-area-inset-top))] sm:px-10 lg:border-0 lg:px-14 lg:py-8">
        <a
          href="https://outboundos.space"
          className="flex items-center gap-2.5 rounded-md focus-visible:outline focus-visible:outline-2 focus-visible:outline-focus"
          aria-label="Outbound OS website"
        >
          <BrandMark className="h-8 w-8 text-text-primary" />
          <span className="text-[15px] font-semibold tracking-tight">Outbound OS</span>
        </a>
        <a
          href={SUPPORT_URL}
          target="_blank"
          rel="noreferrer"
          className="inline-flex min-h-10 items-center gap-1.5 text-xs text-text-secondary transition-colors hover:text-text-primary focus-visible:outline focus-visible:outline-2 focus-visible:outline-focus"
        >
          Need help? <ArrowUpRight aria-hidden="true" className="h-3.5 w-3.5" />
        </a>
      </header>

      <div className="mx-auto grid w-full max-w-[1440px] flex-1 lg:grid-cols-[1.1fr_1fr]">
        <section
          className="relative hidden flex-col justify-center px-14 pb-16 lg:flex xl:px-20"
          aria-label="Your sales workspace"
        >
          <div
            aria-hidden="true"
            className="absolute inset-y-16 right-0 w-px bg-gradient-to-b from-transparent via-border to-transparent"
          />
          <p className="flex items-center gap-2 text-[11px] font-medium uppercase tracking-[0.15em] text-text-muted">
            <span className="h-1.5 w-1.5 rounded-full bg-[#9ba5ff]" /> A clearer way to sell
          </p>
          <p className="mt-6 max-w-lg text-[clamp(2.5rem,4.3vw,4.25rem)] font-semibold leading-[1.09] tracking-[-0.055em]">
            Every conversation.
            <br />
            <span className="text-text-secondary">A clear next step.</span>
          </p>
          <p className="mt-6 max-w-sm text-sm leading-7 text-text-secondary">
            Your leads, conversations and follow-ups, together in one focused workspace.
          </p>

          <div className="mt-12 max-w-[410px] overflow-hidden rounded-xl border border-border bg-surface/60">
            <div className="flex items-center gap-2 border-b border-border px-4 py-3 text-[11px] text-text-muted">
              <Inbox aria-hidden="true" className="h-3.5 w-3.5" /> Built around the next
              conversation
            </div>
            <div className="flex items-center gap-3 p-4">
              <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-lg border border-border bg-surface-raised">
                <MessageSquare aria-hidden="true" className="h-4 w-4 text-text-secondary" />
              </div>
              <div className="min-w-0 flex-1">
                <p className="text-xs font-medium">From first enquiry to follow-up</p>
                <p className="mt-1 text-[11px] text-text-muted">One inbox. The context you need.</p>
              </div>
              <ArrowRight aria-hidden="true" className="h-4 w-4 text-text-muted" />
            </div>
            <div className="grid grid-cols-3 gap-px border-t border-border bg-border">
              {['Capture', 'Converse', 'Follow through'].map((step) => (
                <p
                  key={step}
                  className="flex items-center justify-center gap-1.5 bg-surface px-2 py-3 text-[10px] text-text-secondary"
                >
                  <Check aria-hidden="true" className="h-3 w-3 text-text-muted" />
                  {step}
                </p>
              ))}
            </div>
          </div>
          <p className="mt-6 text-[11px] text-text-muted">
            Open source. Your workspace, your control.
          </p>
        </section>

        <section
          className="flex min-w-0 flex-col justify-center px-6 py-10 sm:px-10 lg:px-14 lg:pb-20 xl:px-20"
          aria-labelledby="sign-in-heading"
        >
          <div className="mx-auto w-full max-w-[380px]">
            <div className="mb-7 flex h-10 w-10 items-center justify-center rounded-lg border border-border bg-surface">
              <LockKeyhole aria-hidden="true" className="h-4 w-4 text-text-secondary" />
            </div>
            <p className="text-[10px] font-medium uppercase tracking-[0.16em] text-text-muted">
              Workspace access
            </p>
            <h1
              id="sign-in-heading"
              className="mt-2 text-[27px] font-semibold leading-tight tracking-[-0.035em]"
            >
              Welcome back.
            </h1>
            <p className="mb-8 mt-3 text-[13px] leading-6 text-text-secondary">
              {provider === 'clerk'
                ? 'Sign in to continue to your workspace.'
                : 'Enter your work email and password to continue.'}
            </p>
            {provider === 'clerk' ? <ClerkSignIn /> : <LocalSignInForm />}
            <p className="mt-6 border-t border-border pt-5 text-[11px] leading-5 text-text-muted">
              {provider === 'clerk'
                ? 'Use the email associated with your workspace membership. Contact your workspace admin if you need access.'
                : 'Accounts are created by your workspace admin. Contact them if you need access.'}
            </p>
          </div>
        </section>
      </div>
      <footer className="flex flex-wrap items-center justify-between gap-3 border-t border-border-subtle px-6 pb-[max(1.25rem,env(safe-area-inset-bottom))] pt-5 text-[10px] text-text-muted sm:px-10 lg:px-14">
        <span>Outbound OS · Your sales workspace</span>
        <span className="inline-flex items-center gap-1.5">
          <LockKeyhole aria-hidden="true" className="h-3 w-3" />
          {provider === 'clerk' ? 'Identity secured by Clerk' : 'Workspace sign-in'}
        </span>
      </footer>
    </main>
  )
}
