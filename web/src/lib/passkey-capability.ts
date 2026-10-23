type PasskeyEnvironment = {
  user_settings?: { attributes?: { passkey?: { enabled?: unknown } } }
}

/** Read public settings only; an absent or changed response never enables UI. */
export function passkeysEnabled(environment: unknown): boolean | null {
  if (!environment || typeof environment !== 'object') return null
  const payload = 'response' in environment ? environment.response : environment
  if (!payload || typeof payload !== 'object') return null
  const enabled = (payload as PasskeyEnvironment).user_settings?.attributes?.passkey?.enabled
  return typeof enabled === 'boolean' ? enabled : null
}

export async function loadPasskeyCapability(
  frontendApi: string,
  fetcher: typeof fetch = fetch,
): Promise<boolean | null> {
  // The SDK supplies this host. No token, cookie, user ID or dashboard session
  // is sent to Clerk's documented public environment endpoint.
  const origin = new URL(frontendApi.includes('://') ? frontendApi : `https://${frontendApi}`)
  if (
    origin.protocol !== 'https:' ||
    origin.username ||
    origin.password ||
    origin.search ||
    origin.hash ||
    origin.pathname !== '/'
  )
    throw new Error('Invalid identity service URL')
  const response = await fetcher(new URL('/v1/environment', origin), {
    credentials: 'omit',
    headers: { Accept: 'application/json' },
    signal: AbortSignal.timeout(5000),
  })
  if (!response.ok) throw new Error('Identity settings unavailable')
  return passkeysEnabled(await response.json())
}

export type PasskeyAvailability =
  'available' | 'unknown' | 'disabled' | 'unsupported' | 'production_setup_needed'

export function passkeyAvailability({
  enabled,
  secureContext,
  webAuthn,
  instanceType,
  hostname,
}: {
  enabled: boolean | null | undefined
  secureContext: boolean
  webAuthn: boolean
  instanceType: string | undefined
  hostname: string
}): PasskeyAvailability {
  if (instanceType !== 'production' && !['localhost', '127.0.0.1', '[::1]'].includes(hostname))
    return 'production_setup_needed'
  if (enabled == null) return 'unknown'
  if (!enabled) return 'disabled'
  if (!secureContext || !webAuthn) return 'unsupported'
  return 'available'
}

/** Distinguish an incomplete/cancelled device prompt from a created passkey. */
export function passkeyErrorMessage(error: unknown): string {
  if (error && typeof error === 'object') {
    const name = 'name' in error ? error.name : undefined
    const code = 'code' in error ? error.code : undefined
    if (name === 'NotAllowedError' || code === 'passkey_not_allowed')
      return 'Passkey setup was cancelled or timed out. You can try again; email sign-in is still available.'
    if (name === 'SecurityError' || code === 'passkey_invalid_rpID')
      return 'This site is not configured for passkeys yet. Keep using email sign-in and contact your workspace admin.'
  }
  return 'The passkey could not be added. Try again, or manage your sign-in methods in security settings.'
}
