import { DeviceNotifications } from '@/components/notifications/device-notifications'
import { ClerkPasskeys } from '@/components/auth/clerk-passkeys'
import { Link, useLocation } from 'react-router-dom'
import { useEffect, useState, type FormEvent } from 'react'
import { useClerk, useReverification, useSession, useUser } from '@clerk/react'
import { useQuery, useQueryClient } from '@tanstack/react-query'
import {
  ArrowUpRight,
  Bell,
  Check,
  Link2,
  LogOut,
  Monitor,
  Moon,
  ShieldCheck,
  Smartphone,
  Sun,
  UserRound,
} from 'lucide-react'
import { api } from '@/api/client'
import { toast } from '@/stores/toast-store'
import { useAuthStore } from '@/stores/auth-store'
import { useUIStore, type Theme } from '@/stores/ui-store'
import { ROLE_EXPERIENCE } from '@/lib/role-shell'
import { PageHeader } from '@/components/ui/page-header'
import { SectionCard } from '@/components/ui/section-card'
import { Button } from '@/components/ui/button'
import { ConfirmDialog } from '@/components/ui/dialog'
import { cn } from '@/lib/utils'

/**
 * Your own account.
 *
 * With Clerk sign-in, Clerk owns identity, so openUserProfile() opens its own
 * profile/security modal. With built-in sign-in, the password is changed
 * here; name and email are set by a workspace admin under Team.
 */

const THEME_OPTIONS: Array<{ value: Theme; label: string; icon: React.ElementType }> = [
  { value: 'light', label: 'Light', icon: Sun },
  { value: 'dark', label: 'Dark', icon: Moon },
  { value: 'system', label: 'System', icon: Monitor },
]

function Field({
  label,
  hint,
  children,
}: {
  label: string
  hint?: string
  children: React.ReactNode
}) {
  return (
    <label className="block">
      <span className="text-[12px] font-medium text-text-secondary">{label}</span>
      <div className="mt-1">{children}</div>
      {hint && <p className="mt-1 text-[11px] text-text-muted">{hint}</p>}
    </label>
  )
}

const inputClass =
  'h-11 w-full rounded-md border border-border bg-surface px-2.5 text-base sm:h-9 sm:text-[13px] text-text-primary placeholder:text-text-muted focus:border-focus focus:outline-none focus:ring-3 focus:ring-focus-muted disabled:opacity-60'

const ACCOUNT_SECTIONS = [
  { id: 'profile', label: 'Profile', icon: UserRound },
  { id: 'security', label: 'Sign-in & security', icon: ShieldCheck },
  { id: 'notifications', label: 'Notifications', icon: Bell },
  { id: 'preferences', label: 'Preferences', icon: Moon },
  { id: 'access', label: 'Workspace access', icon: Link2 },
]

export default function AccountPage() {
  const location = useLocation()
  const mobile = location.pathname.startsWith('/m/')
  const user = useAuthStore((state) => state.user)
  const logout = useAuthStore((state) => state.logout)
  const { theme, setTheme } = useUIStore()
  const experience = ROLE_EXPERIENCE[user?.role || 'viewer']
  const provider = useAuthStore((state) => state.provider)
  const canManageTeam = useAuthStore((state) => state.hasCapability('page.team'))
  const [signOutOpen, setSignOutOpen] = useState(false)
  useEffect(() => {
    const id = location.hash.slice(1)
    if (!ACCOUNT_SECTIONS.some((section) => section.id === id)) return
    // React Router does not scroll to a fragment when the palette changes pages.
    const frame = requestAnimationFrame(() => document.getElementById(id)?.scrollIntoView())
    return () => cancelAnimationFrame(frame)
  }, [location.hash])

  return (
    <div className={cn('mx-auto max-w-6xl animate-fade-in space-y-5', mobile && 'mobile-account')}>
      {!mobile && (
        <PageHeader
          title="Account"
          description="Your identity, devices and personal preferences."
        />
      )}
      <div className="grid items-start gap-5 lg:grid-cols-[180px_minmax(0,1fr)] lg:gap-8">
        <nav
          aria-label="Account sections"
          className="flex gap-1 overflow-x-auto pb-1 lg:sticky lg:top-5 lg:flex-col lg:overflow-visible"
        >
          {ACCOUNT_SECTIONS.map(({ id, label, icon: Icon }) => (
            <a
              key={id}
              href={`#${id}`}
              className="inline-flex min-h-11 shrink-0 items-center gap-2 rounded-md px-3 text-xs font-medium text-text-secondary transition-colors hover:bg-surface-raised hover:text-text-primary focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-focus"
            >
              <Icon aria-hidden="true" className="h-4 w-4" />
              {label}
            </a>
          ))}
        </nav>
        <div className="min-w-0 space-y-4">
          <div id="profile" className="scroll-mt-5">
            <SectionCard title="Profile" description="Your personal identity in this workspace.">
              {provider === 'clerk' ? (
                <ClerkProfile />
              ) : (
                <div className="space-y-4">
                  <ProfileDetails name={user?.name || ''} email={user?.email || ''} />
                  <p className="text-xs leading-5 text-text-muted">
                    A workspace administrator manages your name and email under Team.
                  </p>
                </div>
              )}
            </SectionCard>
          </div>
          <div id="security" className="scroll-mt-5">
            {provider === 'clerk' ? (
              <ClerkSecurity />
            ) : (
              <SectionCard
                title="Sign-in & security"
                description="Email and password sign-in managed by this workspace."
              >
                <ChangePasswordForm />
              </SectionCard>
            )}
          </div>
          <div id="notifications" className="scroll-mt-5">
            <DeviceNotifications />
          </div>
          <div id="preferences" className="scroll-mt-5">
            <SectionCard
              title="Preferences"
              description="Appearance is saved in this browser or Home Screen app."
            >
              <fieldset>
                <legend className="mb-3 text-[13px] font-medium">Theme</legend>
                <div className="flex flex-wrap gap-2">
                  {THEME_OPTIONS.map((option) => {
                    const Icon = option.icon
                    const active = theme === option.value
                    return (
                      <button
                        key={option.value}
                        type="button"
                        onClick={() => setTheme(option.value)}
                        aria-pressed={active}
                        className={cn(
                          'inline-flex min-h-11 flex-1 items-center justify-center gap-2 rounded-md border px-3 text-[13px] font-medium transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-focus',
                          active
                            ? 'border-border-strong bg-surface-raised text-text-primary'
                            : 'border-border text-text-secondary hover:bg-surface-raised hover:text-text-primary',
                        )}
                      >
                        <Icon aria-hidden="true" className="h-4 w-4" />
                        {option.label}
                      </button>
                    )
                  })}
                </div>
              </fieldset>
              <p className="mt-3 text-xs leading-5 text-text-muted">
                System follows your device’s appearance. This setting does not change workspace
                schedules or other devices.
              </p>
            </SectionCard>
          </div>
          <div id="access" className="scroll-mt-5">
            <SectionCard
              title="Workspace access"
              description="Permissions are assigned by your workspace administrator."
            >
              <dl className="grid grid-cols-[auto_minmax(0,1fr)] gap-x-4 gap-y-2 text-[13px]">
                <dt className="text-text-muted">Role</dt>
                <dd className="font-medium">{experience.label}</dd>
                <dt className="text-text-muted">Access</dt>
                <dd className="text-text-secondary">{experience.subtitle}</dd>
              </dl>
              {!mobile && canManageTeam && (
                <Button asChild size="sm" variant="secondary" className="mt-4">
                  <Link to="/team">
                    Manage team
                    <ArrowUpRight aria-hidden="true" className="h-3.5 w-3.5" />
                  </Link>
                </Button>
              )}
              <p className="mt-4 text-xs leading-5 text-text-muted">
                Personal sign-in and notification devices are managed here. Shared mailboxes,
                senders and domain connections belong in Integrations.
              </p>
            </SectionCard>
          </div>
          <div className="flex flex-wrap items-center justify-between gap-3 rounded-lg border border-border p-4">
            <div>
              <p className="text-[13px] font-medium">Done on this device?</p>
              <p className="mt-1 text-xs text-text-muted">
                Signing out also disconnects its notification subscription.
              </p>
            </div>
            <Button
              variant="secondary"
              onClick={() => setSignOutOpen(true)}
              leftIcon={<LogOut aria-hidden="true" className="h-4 w-4" />}
            >
              Sign out
            </Button>
          </div>
        </div>
      </div>
      <ConfirmDialog
        open={signOutOpen}
        onOpenChange={setSignOutOpen}
        title="Sign out of this device?"
        description="You will need to sign in again. Other sign-in sessions and shared workspace connections will stay active."
        confirmLabel="Sign out"
        onConfirm={logout}
      />
    </div>
  )
}

function ProfileDetails({ name, email }: { name: string; email: string }) {
  return (
    <dl className="grid gap-4 sm:grid-cols-2">
      <div>
        <dt className="text-xs text-text-muted">Name</dt>
        <dd className="mt-1 break-words text-sm font-medium">{name || 'Name not set'}</dd>
      </div>
      <div>
        <dt className="text-xs text-text-muted">Primary email</dt>
        <dd className="mt-1 break-all text-sm font-medium">{email || 'Email not set'}</dd>
      </div>
    </dl>
  )
}

function ClerkProfile() {
  const { user } = useUser()
  const { openUserProfile } = useClerk()
  const account = useAuthStore((state) => state.user)
  return (
    <div className="space-y-4">
      <div className="flex items-center gap-3">
        {user?.hasImage ? (
          <img
            src={user.imageUrl}
            alt=""
            className="h-12 w-12 shrink-0 rounded-full object-cover"
            referrerPolicy="no-referrer"
          />
        ) : (
          <span className="flex h-12 w-12 shrink-0 items-center justify-center rounded-full border border-border bg-surface-raised">
            <UserRound aria-hidden="true" className="h-5 w-5 text-text-muted" />
          </span>
        )}
        <p className="text-xs leading-5 text-text-secondary">
          Your profile and verified addresses are managed securely by Clerk.
        </p>
      </div>
      <ProfileDetails
        name={user?.fullName || account?.name || ''}
        email={user?.primaryEmailAddress?.emailAddress || account?.email || ''}
      />
      {user?.primaryEmailAddress?.verification.status === 'verified' && (
        <p className="flex items-center gap-1.5 text-xs text-text-secondary">
          <Check aria-hidden="true" className="h-3.5 w-3.5 text-success" />
          Email verified
        </p>
      )}
      <Button size="sm" variant="secondary" onClick={() => openUserProfile()}>
        Edit profile
      </Button>
    </div>
  )
}

function ClerkSecurity() {
  const { user, isLoaded } = useUser()
  const { session } = useSession()
  const { openUserProfile } = useClerk()
  const scope = useAuthStore((state) => state.dashboardScope)
  const queryClient = useQueryClient()
  const [revokeId, setRevokeId] = useState<string | null>(null)
  const [revoking, setRevoking] = useState(false)
  const [error, setError] = useState('')
  const sessions = useQuery({
    queryKey: ['account-sessions', scope, user?.id],
    queryFn: async () => (await user!.getSessions()).filter((item) => item.status === 'active'),
    enabled: isLoaded && Boolean(user),
    staleTime: 30_000,
    retry: false,
    meta: { silent: true },
  })
  const revoke = useReverification(async (id: string) => {
    if (!user || id === session?.id) throw new Error('Use Sign out to end this session.')
    const target = (await user.getSessions()).find((item) => item.id === id)
    if (target?.status === 'active') await target.revoke()
    return true
  })
  async function endSession() {
    if (!revokeId) return
    setRevoking(true)
    setError('')
    try {
      const completed = await revoke(revokeId)
      if (completed !== true) throw new Error('Session sign-out was not completed.')
      await queryClient.invalidateQueries({ queryKey: ['account-sessions', scope] })
      setRevokeId(null)
      toast.success('Session signed out')
    } catch {
      setError('That session could not be signed out. Try again or use Manage sign-in methods.')
    } finally {
      setRevoking(false)
    }
  }
  return (
    <SectionCard
      title="Sign-in & security"
      description="Your login methods and active sessions, managed by Clerk."
    >
      <div className="space-y-5">
        {!isLoaded ? (
          <p role="status" className="text-sm text-text-muted">
            Loading sign-in methods…
          </p>
        ) : (
          <>
            <dl className="space-y-2 text-[13px]">
              <div className="flex flex-wrap justify-between gap-2">
                <dt className="text-text-secondary">Password</dt>
                <dd>{user?.passwordEnabled ? 'Set on your account' : 'No password set'}</dd>
              </div>
              <div className="flex flex-wrap justify-between gap-2">
                <dt className="text-text-secondary">Two-step verification</dt>
                <dd>{user?.twoFactorEnabled ? 'Enabled' : 'Not enabled'}</dd>
              </div>
            </dl>
            {user?.externalAccounts.length ? (
              <div>
                <h3 className="text-[13px] font-medium">Linked sign-in accounts</h3>
                <ul className="mt-2 space-y-2">
                  {user.externalAccounts.map((account) => (
                    <li
                      key={account.id}
                      className="flex flex-wrap justify-between gap-2 text-[13px]"
                    >
                      <span className="capitalize text-text-secondary">
                        {account.provider.replace(/^oauth_/, '').replace(/_/g, ' ')}
                      </span>
                      <span className="break-all">
                        {account.emailAddress || account.username || 'Connected'}
                      </span>
                    </li>
                  ))}
                </ul>
                <p className="mt-2 text-xs leading-5 text-text-muted">
                  A linked sign-in account does not grant access to your email inbox.
                </p>
              </div>
            ) : null}
            <Button variant="secondary" size="sm" onClick={() => openUserProfile()}>
              Manage sign-in methods
            </Button>
            <p className="text-xs leading-5 text-text-muted">
              Only methods available to this workspace appear in Clerk’s account settings. Keep your
              recovery email accessible outside Outbound OS.
            </p>
          </>
        )}
        <div className="border-t border-border pt-4">
          <ClerkPasskeys />
        </div>
        <div className="border-t border-border pt-4">
          <h3 className="text-[13px] font-medium">Active sign-in sessions</h3>
          <p className="mt-1 text-xs leading-5 text-text-muted">
            Sign out an unfamiliar session. Notification devices are managed separately below.
          </p>
          {sessions.isPending ? (
            <p role="status" className="mt-3 text-xs text-text-muted">
              Loading sessions…
            </p>
          ) : sessions.error ? (
            <div className="mt-3 flex flex-wrap items-center gap-2">
              <p className="text-xs text-text-secondary">Sessions could not be loaded.</p>
              <Button size="sm" variant="secondary" onClick={() => void sessions.refetch()}>
                Try again
              </Button>
            </div>
          ) : sessions.data?.length === 0 ? (
            <p className="mt-3 text-xs text-text-muted">
              No active sessions were returned by the identity service.
            </p>
          ) : (
            <ul className="mt-2 divide-y divide-border">
              {sessions.data?.map((item) => {
                const current = item.id === session?.id
                const activity = item.latestActivity
                const Icon = activity?.isMobile ? Smartphone : Monitor
                return (
                  <li key={item.id} className="flex items-start gap-3 py-3">
                    <Icon aria-hidden="true" className="mt-1 h-4 w-4 shrink-0 text-text-muted" />
                    <div className="min-w-0 flex-1">
                      <p className="text-[13px] font-medium">
                        {[activity?.browserName, activity?.deviceType]
                          .filter(Boolean)
                          .join(' · ') || 'Signed-in device'}
                        {current && (
                          <span className="ml-2 text-xs font-normal text-text-muted">
                            This session
                          </span>
                        )}
                      </p>
                      <p className="mt-1 text-xs text-text-muted">
                        Last active {item.lastActiveAt.toLocaleString()}
                      </p>
                    </div>
                    {!current && (
                      <Button
                        size="sm"
                        variant="ghost"
                        disabled={revoking}
                        onClick={() => setRevokeId(item.id)}
                      >
                        Sign out
                      </Button>
                    )}
                  </li>
                )
              })}
            </ul>
          )}
          {error && (
            <p role="alert" className="mt-3 text-xs text-danger">
              {error}
            </p>
          )}
        </div>
      </div>
      <ConfirmDialog
        open={Boolean(revokeId)}
        onOpenChange={(open) => {
          if (!revoking && !open) setRevokeId(null)
        }}
        title="Sign out this session?"
        description="That device will need to sign in again. Its separate notification subscription is unchanged; remove it under Notifications if needed."
        confirmLabel="Sign out session"
        destructive
        isLoading={revoking}
        onConfirm={endSession}
      />
    </SectionCard>
  )
}

function ChangePasswordForm() {
  const [currentPassword, setCurrentPassword] = useState('')
  const [newPassword, setNewPassword] = useState('')
  const [pending, setPending] = useState(false)
  const tooShort = newPassword.length > 0 && newPassword.length < 10

  async function onSubmit(event: FormEvent) {
    event.preventDefault()
    setPending(true)
    try {
      await api.post('/auth/change-password', { currentPassword, newPassword })
      setCurrentPassword('')
      setNewPassword('')
      toast.success('Password changed')
    } catch (error) {
      toast.error(error instanceof Error ? error.message : 'Could not change the password')
    } finally {
      setPending(false)
    }
  }

  return (
    <form onSubmit={onSubmit} className="space-y-3">
      <Field label="Current password">
        <input
          className={inputClass}
          type="password"
          autoComplete="current-password"
          value={currentPassword}
          onChange={(event) => setCurrentPassword(event.target.value)}
        />
      </Field>
      <Field
        label="New password"
        hint={tooShort ? 'Use at least 10 characters.' : 'At least 10 characters.'}
      >
        <input
          className={inputClass}
          type="password"
          autoComplete="new-password"
          value={newPassword}
          onChange={(event) => setNewPassword(event.target.value)}
        />
      </Field>
      <div className="pt-1">
        <Button
          type="submit"
          size="sm"
          pending={pending}
          pendingLabel="Saving…"
          disabled={!currentPassword || newPassword.length < 10}
        >
          Change password
        </Button>
      </div>
    </form>
  )
}
