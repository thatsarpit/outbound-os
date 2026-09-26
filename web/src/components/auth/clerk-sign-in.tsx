import { SignIn } from '@clerk/react'

/**
 * Clerk's hosted email-code sign-in, styled to sit inside the login card.
 * Only rendered when the server's provider is Clerk (it needs ClerkProvider).
 * Social controls are hidden as a defence-in-depth UI rule; the providers are
 * disabled in Clerk too.
 */
export function ClerkSignIn() {
  return (
    <SignIn
      routing="hash"
      withSignUp={false}
      transferable={false}
      fallbackRedirectUrl="/"
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
          cardBox: { width: '100%', maxWidth: 'none', boxShadow: 'none' },
          card: {
            width: '100%',
            maxWidth: 'none',
            padding: 0,
            border: 0,
            background: 'transparent',
            boxShadow: 'none',
          },
          header: { display: 'none' },
          socialButtons: { display: 'none' },
          socialButtonsBlockButton: { display: 'none' },
          dividerRow: { display: 'none' },
          footer: { display: 'none' },
          footerAction: { display: 'none' },
          form: 'gap-4',
          formFieldLabel: 'text-[12px] font-medium text-text-secondary',
          formFieldInput:
            'h-10 rounded-md border-border bg-surface px-3 text-[13px] text-text-primary shadow-none placeholder:text-text-muted focus:border-focus focus:ring-2 focus:ring-focus-muted',
          formButtonPrimary:
            'h-10 rounded-md bg-accent text-[13px] font-medium text-accent-fg shadow-none hover:bg-accent-hover focus:ring-2 focus:ring-focus-muted',
          identityPreview: 'rounded-md border border-border bg-surface-raised',
          otpCodeFieldInput:
            'h-11 rounded-md border-border bg-surface text-text-primary shadow-none focus:border-focus focus:ring-2 focus:ring-focus-muted',
          formResendCodeLink: 'text-focus hover:text-focus',
          alert: 'rounded-md border border-danger bg-danger-muted text-danger',
        },
      }}
    />
  )
}
