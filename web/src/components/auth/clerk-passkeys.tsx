import { useState } from 'react'
import { useClerk, useReverification, useUser } from '@clerk/react'
import { useQuery } from '@tanstack/react-query'
import { Check, Fingerprint, KeyRound, Plus } from 'lucide-react'
import { Button } from '@/components/ui/button'
import {
  loadPasskeyCapability,
  passkeyAvailability,
  passkeyErrorMessage,
} from '@/lib/passkey-capability'
import { toast } from '@/stores/toast-store'

const UNAVAILABLE_COPY = {
  unknown:
    'Passkey settings could not be verified. You can keep signing in with email while your workspace admin checks the identity configuration.',
  disabled:
    'Passkeys are not enabled for this workspace. Keep using your existing sign-in method; availability depends on the workspace’s Clerk plan and configuration.',
  unsupported:
    'This browser cannot create passkeys here. Use a current browser on a secure connection, or keep using email sign-in.',
  production_setup_needed:
    'Passkeys are unavailable in this workspace’s current identity setup. They also require a supported Clerk plan. Keep using your existing sign-in method.',
}

/** Only mounted inside ClerkProvider, after the personal account is signed in. */
export function ClerkPasskeys() {
  const clerk = useClerk()
  const { user, isLoaded } = useUser()
  const [pending, setPending] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const {
    data: enabled,
    isPending,
    isFetching,
    refetch,
  } = useQuery({
    queryKey: ['clerk-passkey-capability', clerk.frontendApi],
    queryFn: () => loadPasskeyCapability(clerk.frontendApi),
    enabled: Boolean(clerk.frontendApi),
    staleTime: 5 * 60_000,
    retry: false,
    meta: { silent: true },
  })
  const createPasskey = useReverification(async () => {
    if (!user) throw new Error('Sign in before adding a passkey')
    return user.createPasskey()
  })
  const availability = passkeyAvailability({
    enabled,
    secureContext: window.isSecureContext,
    webAuthn:
      typeof window.PublicKeyCredential !== 'undefined' && Boolean(navigator.credentials?.create),
    instanceType: clerk.instanceType,
    hostname: window.location.hostname,
  })
  const passkeys = user?.passkeys ?? []

  async function handleCreate() {
    if (availability !== 'available' || !user) return
    setPending(true)
    setError(null)
    try {
      const passkey = await createPasskey()
      if (!passkey?.id) throw new Error('Passkey creation was not completed')
      toast.success('Passkey added to your account')
      // Clerk normally updates useUser after creation. A reload also refreshes
      // the list when another device or browser changed this account recently.
      void user.reload().catch(() => {})
    } catch (cause) {
      setError(passkeyErrorMessage(cause))
    } finally {
      setPending(false)
    }
  }

  if (availability !== 'available') {
    return (
      <div className="flex items-start gap-3">
        <Fingerprint aria-hidden="true" className="mt-0.5 h-4 w-4 shrink-0 text-text-muted" />
        <div className="min-w-0">
          <h3 className="text-[13px] font-medium">Passkeys</h3>
          <p className="mt-1 text-xs leading-5 text-text-muted">
            {isPending && availability === 'unknown'
              ? 'Checking availability…'
              : UNAVAILABLE_COPY[availability]}
          </p>
          {passkeys.length > 0 && (
            <p className="mt-1 text-xs text-text-secondary">
              {passkeys.length} registered on your account. Manage them in sign-in settings.
            </p>
          )}
          {availability === 'unknown' && !isPending && (
            <Button
              className="mt-2"
              variant="ghost"
              size="sm"
              onClick={() => void refetch()}
              pending={isFetching}
              pendingLabel="Checking…"
            >
              Check availability
            </Button>
          )}
        </div>
      </div>
    )
  }

  return (
    <div>
      <div className="space-y-4">
        <div className="flex items-start gap-3">
          <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-lg border border-border bg-surface-raised">
            <Fingerprint aria-hidden="true" className="h-5 w-5 text-text-secondary" />
          </span>
          <div>
            <p className="text-[13px] font-medium text-text-primary">A simpler way back in</p>
            <p className="mt-1 text-xs leading-5 text-text-secondary">
              On iPhone, choose Passwords or iCloud Keychain in the system prompt. Your device
              manages the passkey; Outbound OS never receives your Face ID or fingerprint.
            </p>
          </div>
        </div>

        {passkeys.length > 0 && (
          <ul className="divide-y divide-border rounded-md border border-border">
            {passkeys.slice(0, 3).map((passkey) => (
              <li key={passkey.id} className="flex items-center gap-2.5 px-3 py-3">
                <KeyRound aria-hidden="true" className="h-4 w-4 shrink-0 text-text-muted" />
                <div className="min-w-0 flex-1">
                  <p className="truncate text-xs font-medium">{passkey.name || 'Saved passkey'}</p>
                  <p className="mt-1 text-[11px] text-text-muted">
                    {passkey.lastUsedAt
                      ? `Last used ${passkey.lastUsedAt.toLocaleDateString()}`
                      : 'Not used to sign in yet'}
                  </p>
                </div>
                <Check aria-label="Registered" className="h-3.5 w-3.5 text-success" />
              </li>
            ))}
            {passkeys.length > 3 && (
              <li className="px-3 py-2 text-xs text-text-muted">
                {passkeys.length - 3} more in security settings
              </li>
            )}
          </ul>
        )}

        {error && (
          <p
            role="alert"
            className="rounded-md border border-danger/30 bg-danger-muted p-3 text-xs leading-5 text-danger"
          >
            {error}
          </p>
        )}

        <div className="flex flex-wrap gap-2">
          {availability === 'available' && (
            <Button
              size="sm"
              onClick={() => void handleCreate()}
              pending={pending}
              pendingLabel="Waiting for your device…"
              disabled={!isLoaded || !user || passkeys.length >= 10}
            >
              <Plus aria-hidden="true" className="h-3.5 w-3.5" />
              Add passkey
            </Button>
          )}
          <Button variant="secondary" size="sm" onClick={() => clerk.openUserProfile()}>
            Security settings
          </Button>
        </div>
        {passkeys.length >= 10 && (
          <p className="text-[11px] leading-5 text-text-muted">
            This account has the maximum of 10 passkeys. Manage existing passkeys in security
            settings.
          </p>
        )}
        <p className="text-[11px] leading-5 text-text-muted">
          Keep access to your email as a fallback. Passkeys are tied to this site’s domain; create
          them on the site you use every day.
        </p>
      </div>
    </div>
  )
}
