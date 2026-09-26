import { useEffect } from 'react'
import { useAuth, useOrganization, useUser } from '@clerk/react'
import { useAuthStore } from '@/stores/auth-store'

/**
 * Bridges Clerk's hook-based state into the existing Zustand auth store.
 *
 * Kept as a bridge rather than rewriting every consumer to call Clerk's hooks
 * directly: 13 files read useAuthStore() today (sidebar, topbar, route
 * guards, the command palette...). Feeding the same store from a different
 * source is a much smaller, more reviewable change than touching all 13.
 *
 * Mount once, inside <ClerkProvider>, above the router.
 */
export function ClerkAuthBridge() {
  const { isLoaded: authLoaded, isSignedIn, orgRole, orgId, signOut, getToken } = useAuth()
  const { user, isLoaded: userLoaded } = useUser()
  const { organization } = useOrganization()

  useEffect(() => {
    const setFromClerk = useAuthStore.getState().setFromClerk
    if (!authLoaded || !userLoaded) {
      setFromClerk({ status: 'loading' })
      return
    }
    if (!isSignedIn || !user) {
      setFromClerk({ status: 'signed-out' })
      return
    }
    setFromClerk({
      status: 'signed-in',
      clerkUserId: user.id,
      name: user.fullName || user.primaryEmailAddress?.emailAddress || 'there',
      email: user.primaryEmailAddress?.emailAddress || '',
      orgId: orgId ?? null,
      orgName: organization?.name ?? null,
      orgRole: orgRole ?? null,
      signOut: () => {
        void signOut()
      },
      getToken: () => getToken(),
    })
  }, [authLoaded, userLoaded, isSignedIn, user, orgId, orgRole, organization, signOut, getToken])

  return null
}
