import { create } from 'zustand'
import type { User } from '@/api/types'
import {
  ROLE_PAGE_CAPABILITIES,
  getHomeRouteForRole,
  normalizeAppRole,
  type AppRole,
} from '@/lib/role-shell'
import { appRoleFromOrgRole } from '@/lib/clerk-role'

/**
 * Auth state. Fed by one of two bridges, depending on the server's sign-in
 * provider (GET /api/auth/config):
 *   - LocalAuthBridge for built-in email + password (setFromLocal)
 *   - ClerkAuthBridge for Clerk (setFromClerk)
 *
 * The public shape is kept identical to the pre-Clerk version on purpose: 13
 * files consume useAuthStore() across sidebar, topbar, route guards and more.
 * Only setFromClerk (called by the bridge) and the internals behind it are
 * new; every existing consumer needed zero changes.
 *
 * login/loginWithOtp are gone — login.tsx now renders Clerk's own <SignIn/>,
 * which owns the credential flow directly rather than calling into this
 * store. checkAuth is kept as a no-op: Clerk's session state is already
 * reactive, so the two call sites that used to force a re-fetch (App.tsx's
 * mount effect, invite.tsx's post-accept refresh) no longer need to do
 * anything, but keeping the method means neither file needed to change.
 *
 * Known gap: invite.tsx / POST /api/auth/accept-invite are the old
 * password-invite flow and are not wired to anything Clerk-based yet. Clerk
 * has its own organization-invite flow (organization.inviteMember(), emailed
 * by Clerk) that should replace it — separate piece of work, not done here.
 */

function resolveCapabilities(role: AppRole): Record<string, boolean> {
  const resolved: Record<string, boolean> = {}
  for (const capability of ROLE_PAGE_CAPABILITIES[role] || []) resolved[capability] = true
  return resolved
}

type ClerkSyncPayload =
  | { status: 'loading' }
  | { status: 'signed-out' }
  | {
      status: 'signed-in'
      clerkUserId: string
      name: string
      email: string
      orgId: string | null
      orgName: string | null
      orgRole: string | null
      signOut: () => void
      getToken: () => Promise<string | null>
    }

export type AuthProvider = 'local' | 'clerk'

/** Where the built-in sign-in keeps its session token in this browser. */
export const LOCAL_SESSION_KEY = 'outboundos_session'

export function readLocalSession(): string | null {
  try {
    return localStorage.getItem(LOCAL_SESSION_KEY)
  } catch {
    return null
  }
}

export function writeLocalSession(token: string | null): void {
  try {
    if (token) localStorage.setItem(LOCAL_SESSION_KEY, token)
    else localStorage.removeItem(LOCAL_SESSION_KEY)
  } catch {
    // Storage blocked (private mode): the session lasts until the tab closes.
  }
}

type LocalSessionUser = { id: number | string; name: string; email: string; role: string }

interface AuthState {
  /** Which sign-in system the server uses. Set once at boot. */
  provider: AuthProvider
  user: User | null
  capabilities: Record<string, boolean>
  isAuthenticated: boolean
  isLoading: boolean
  /** Org exists in Clerk but carries no role this app recognizes (see clerk-role.ts). */
  unrecognizedRole: boolean

  hasCapability: (key: string) => boolean
  isAdmin: () => boolean
  isManagerOrAbove: () => boolean
  getHomeRoute: () => string
  logout: () => void
  /** No-op kept for call-site compatibility — Clerk's session state is already reactive. */
  checkAuth: () => Promise<void>

  /** Internal: called once at boot with the server's provider. */
  setProvider: (provider: AuthProvider) => void
  /** Internal: called by LocalAuthBridge and the built-in sign-in form. */
  setFromLocal: (session: { user: LocalSessionUser; token: string } | null) => void
  /** Internal: called only by ClerkAuthBridge. */
  setFromClerk: (payload: ClerkSyncPayload) => void
  /** Internal: lets api/client.ts pull a fresh Clerk session token per request. */
  _getToken: (() => Promise<string | null>) | null
  /** Internal: Clerk's real sign-out, invoked by the logout() action. */
  _signOut: (() => void) | null
}

export const useAuthStore = create<AuthState>((set, get) => ({
  provider: 'local',
  user: null,
  capabilities: {},
  isAuthenticated: false,
  isLoading: true,
  unrecognizedRole: false,
  _getToken: null,
  _signOut: null,

  hasCapability: (key) => !!get().capabilities[key],
  isAdmin: () => get().user?.role === 'admin',
  isManagerOrAbove: () => {
    const role = get().user?.role
    return role === 'admin' || role === 'manager'
  },
  getHomeRoute: () => getHomeRouteForRole(get().user?.role),
  logout: () => {
    get()._signOut?.()
    set({ user: null, capabilities: {}, isAuthenticated: false, _getToken: null, _signOut: null })
  },
  checkAuth: async () => {},

  setProvider: (provider) => set({ provider }),

  setFromLocal: (session) => {
    if (!session) {
      writeLocalSession(null)
      set({
        user: null,
        capabilities: {},
        isAuthenticated: false,
        isLoading: false,
        unrecognizedRole: false,
        _getToken: null,
        _signOut: null,
      })
      return
    }
    writeLocalSession(session.token)
    const role = normalizeAppRole(session.user.role)
    const user: User = {
      id: Number(session.user.id) || 0,
      name: session.user.name,
      email: session.user.email,
      role,
      enabled: true,
      lastLoginAt: null,
      createdAt: '',
      updatedAt: '',
    }
    const token = session.token
    set({
      user,
      capabilities: resolveCapabilities(role),
      isAuthenticated: true,
      isLoading: false,
      unrecognizedRole: false,
      _getToken: async () => token,
      _signOut: () => writeLocalSession(null),
    })
  },

  setFromClerk: (payload) => {
    if (payload.status === 'loading') {
      set({ isLoading: true })
      return
    }
    if (payload.status === 'signed-out') {
      set({
        user: null,
        capabilities: {},
        isAuthenticated: false,
        isLoading: false,
        unrecognizedRole: false,
        _getToken: null,
      })
      return
    }

    const mappedRole = appRoleFromOrgRole(payload.orgRole)
    if (!mappedRole) {
      // Signed in, but no organization role this app understands — do not
      // guess a role. Surface it as a distinct state so the UI can say
      // "contact your admin" rather than either granting access or bouncing
      // through the normal unauthenticated redirect, which would be
      // confusing for someone who genuinely did sign in successfully.
      set({
        user: null,
        capabilities: {},
        isAuthenticated: false,
        isLoading: false,
        unrecognizedRole: true,
        _getToken: payload.getToken,
      })
      return
    }

    const role = normalizeAppRole(mappedRole)
    const user: User = {
      id: 0, // Clerk's id is a string (payload.clerkUserId); numeric callers should not rely on this.
      name: payload.name,
      email: payload.email,
      role,
      enabled: true,
      lastLoginAt: null,
      createdAt: '',
      updatedAt: '',
    }
    set({
      user,
      capabilities: resolveCapabilities(role),
      isAuthenticated: true,
      isLoading: false,
      unrecognizedRole: false,
      _getToken: payload.getToken,
      _signOut: payload.signOut,
    })
  },
}))

/** The current session token for API calls, whichever provider issued it. Null when signed out. */
export async function getSessionToken(): Promise<string | null> {
  const getToken = useAuthStore.getState()._getToken
  if (!getToken) return null
  return getToken()
}
