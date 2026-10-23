import { useLocation } from 'react-router-dom'
import { loginReturnPath } from '@/lib/login-return'
import { SignIn } from '@clerk/react'

/**
 * Clerk's prebuilt sign-in retains all enabled strategies and recovery steps.
 * Only rendered when the server's provider is Clerk (it needs ClerkProvider).
 * Social controls are hidden as a defence-in-depth UI rule; the providers are
 * disabled in Clerk too.
 */
export function ClerkSignIn() {
  const location = useLocation()
  const from = loginReturnPath(
    (location.state as { from?: { pathname?: string; search?: string } } | null)?.from,
  )
  return (
    <SignIn
      routing="hash"
      withSignUp={false}
      transferable={false}
      fallbackRedirectUrl={from || '/'}
      appearance={{
        variables: {
          colorPrimary: 'var(--color-accent)',
          colorBackground: 'var(--color-surface)',
          colorForeground: 'var(--color-text-primary)',
          colorMutedForeground: 'var(--color-text-secondary)',
          colorInput: 'var(--color-surface)',
          colorInputForeground: 'var(--color-text-primary)',
          colorNeutral: 'var(--color-text-primary)',
          colorRing: 'var(--color-focus)',
          borderRadius: '0.4375rem',
        },
        elements: {
          rootBox: { width: '100%', maxWidth: 'none' },
          // The app supplies the outer card. Clerk's rounded clipping box
          // otherwise cuts the first label and focused input at its edges.
          cardBox: {
            width: '100%',
            maxWidth: 'none',
            boxShadow: 'none',
            border: 0,
            borderRadius: 0,
            overflow: 'visible',
            background: 'transparent',
          },
          card: {
            width: '100%',
            maxWidth: 'none',
            padding: 0,
            margin: 0,
            border: 0,
            background: 'transparent',
            boxShadow: 'none',
          },
          header: { display: 'none' },
          socialButtons: { display: 'none' },
          socialButtonsBlockButton: { display: 'none' },
          dividerRow: { display: 'none' },
          // Keep Clerk's branding and development notice visible. Only the
          // sign-up action is suppressed for this existing-member entry page.
          footer: { background: 'transparent', border: 0 },
          footerAction: { display: 'none' },
          form: 'gap-4',
          formFieldLabel: 'text-[12px] font-medium text-text-secondary',
          // Clerk injects its input sizing after app utilities. Explicitly
          // retain 16px text to avoid iPhone focus zoom and a 44px touch height.
          formFieldInput:
            'min-h-11! text-base! rounded-md border-border bg-surface px-3 text-text-primary shadow-none placeholder:text-text-muted focus:border-focus focus:ring-2 focus:ring-focus-muted',
          formButtonPrimary:
            'h-11 rounded-md bg-accent text-sm font-medium text-accent-fg shadow-none hover:bg-accent-hover focus:ring-2 focus:ring-focus-muted',
          identityPreview: 'rounded-md border border-border bg-surface-raised',
          otpCodeFieldInput:
            'min-h-11! text-base! rounded-md border-border bg-surface text-text-primary shadow-none focus:border-focus focus:ring-2 focus:ring-focus-muted',
          formResendCodeLink: 'text-focus hover:text-focus',
          alert: 'rounded-md border border-danger bg-danger-muted text-danger',
        },
      }}
    />
  )
}
