import type { AuthProvider } from '@/stores/auth-store'

export type AuthConfig = { provider: AuthProvider; clerkPublishableKey?: string }

/**
 * Ask the server which sign-in to render. The same built dashboard then works
 * for every install, instead of baking one provider's key in at build time.
 *
 * If the server cannot be reached, a build-time Clerk key (the hosted
 * deployment sets one) keeps Clerk; otherwise the built-in form is shown and
 * will report the server error itself when someone tries to sign in.
 */
export async function loadAuthConfig(): Promise<AuthConfig> {
  const buildTimeClerkKey = import.meta.env.VITE_CLERK_PUBLISHABLE_KEY as string | undefined
  try {
    const response = await fetch('/api/auth/config', { headers: { Accept: 'application/json' } })
    if (response.ok) {
      const data = (await response.json()) as Partial<AuthConfig>
      if (data.provider === 'clerk') {
        return { provider: 'clerk', clerkPublishableKey: data.clerkPublishableKey || buildTimeClerkKey || '' }
      }
      if (data.provider === 'local') return { provider: 'local' }
    }
  } catch {
    // Fall through to the build-time default.
  }
  return buildTimeClerkKey
    ? { provider: 'clerk', clerkPublishableKey: buildTimeClerkKey }
    : { provider: 'local' }
}
