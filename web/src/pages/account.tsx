import { useState, type FormEvent } from 'react'
import { useClerk } from '@clerk/react'
import { Monitor, Moon, Sun } from 'lucide-react'
import { api } from '@/api/client'
import { toast } from '@/stores/toast-store'
import { useAuthStore } from '@/stores/auth-store'
import { useUIStore, type Theme } from '@/stores/ui-store'
import { ROLE_EXPERIENCE } from '@/lib/role-shell'
import { PageHeader } from '@/components/ui/page-header'
import { SectionCard } from '@/components/ui/section-card'
import { Button } from '@/components/ui/button'
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
  'h-9 w-full rounded-md border border-border bg-surface px-2.5 text-[13px] text-text-primary placeholder:text-text-muted focus:border-focus focus:outline-none focus:ring-3 focus:ring-focus-muted disabled:opacity-60'

export default function AccountPage() {
  const { user } = useAuthStore()
  const { theme, setTheme } = useUIStore()
  const experience = ROLE_EXPERIENCE[user?.role || 'viewer']
  const provider = useAuthStore((state) => state.provider)

  return (
    <div className="animate-fade-in space-y-6">
      <PageHeader title="Account" description="Your profile, sign-in and appearance." />

      <div className="grid grid-cols-1 gap-4 lg:grid-cols-2">
        <SectionCard title="Profile" description="How you appear to the rest of the workspace.">
          <div className="space-y-3">
            <Field label="Name">
              <input className={inputClass} value={user?.name ?? ''} disabled readOnly />
            </Field>
            <Field label="Email">
              <input className={inputClass} value={user?.email ?? ''} disabled readOnly />
            </Field>
            {provider === 'clerk' ? (
              <ClerkProfileButton label="Edit profile" />
            ) : (
              <p className="pt-1 text-[12px] text-text-muted">
                Ask a workspace admin to change your name or email.
              </p>
            )}
          </div>
        </SectionCard>

        <div className="space-y-4">
          {provider === 'clerk' ? (
            <SectionCard title="Password & security" description="Managed by Clerk.">
              <p className="text-[13px] text-text-secondary">
                Change your password, add two-factor authentication, or review active sessions.
              </p>
              <ClerkProfileButton label="Open security settings" />
            </SectionCard>
          ) : (
            <SectionCard title="Password" description="Used to sign in to this workspace.">
              <ChangePasswordForm />
            </SectionCard>
          )}

          <SectionCard title="Appearance" description="Applies to this browser only.">
            <div className="flex items-center gap-1">
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
                      'inline-flex flex-1 items-center justify-center gap-1.5 rounded-md border px-2 py-1.5 text-[12px] font-medium transition-colors',
                      active
                        ? 'border-border-strong bg-surface-raised text-text-primary'
                        : 'border-border text-text-secondary hover:bg-surface-raised hover:text-text-primary',
                    )}
                  >
                    <Icon aria-hidden="true" className="h-3.5 w-3.5" />
                    {option.label}
                  </button>
                )
              })}
            </div>
          </SectionCard>

          <SectionCard title="Access" description="What this account can reach.">
            <dl className="grid grid-cols-[auto_1fr] gap-x-4 gap-y-2 text-[13px]">
              <dt className="text-text-muted">Role</dt>
              <dd className="text-text-primary">{experience.label}</dd>
              <dt className="text-text-muted">Scope</dt>
              <dd className="text-text-secondary">{experience.subtitle}</dd>
            </dl>
          </SectionCard>
        </div>
      </div>
    </div>
  )
}

/** Clerk's profile modal. Only rendered on Clerk sign-in, where ClerkProvider exists. */
function ClerkProfileButton({ label }: { label: string }) {
  const { openUserProfile } = useClerk()
  return (
    <div className="pt-3">
      <Button type="button" size="sm" onClick={() => openUserProfile()}>
        {label}
      </Button>
    </div>
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
      <Field label="New password" hint={tooShort ? 'Use at least 10 characters.' : 'At least 10 characters.'}>
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
