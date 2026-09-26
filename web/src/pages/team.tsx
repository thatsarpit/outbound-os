import { useAuthStore } from '@/stores/auth-store'
import { useState } from 'react'
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { api } from '@/api/client'
import { usersApi } from '@/api/endpoints/users'
import { toast } from '@/stores/toast-store'
import { cn, formatRelativeTime } from '@/lib/utils'
import {
  Loader2,
  Mail,
  Plus,
  Send,
  Shield,
  ShieldCheck,
  Eye,
  UserCog,
  Trash2,
  X,
  User,
  ToggleLeft,
  ToggleRight,
  Users,
  Clock,
} from 'lucide-react'
import { Badge, Button, ConfirmDialog, Input, SelectField as UISelectField } from '@/components/ui'

type RoleVariant = 'danger' | 'accent' | 'success' | 'neutral'
const ROLE_VARIANTS: Record<TeamUser['role'], RoleVariant> = {
  admin: 'danger',
  manager: 'accent',
  agent: 'success',
  viewer: 'neutral',
}

interface TeamUser {
  id: number
  name: string
  email: string
  phone?: string | null
  role: 'admin' | 'manager' | 'agent' | 'viewer'
  enabled: boolean
  lastLoginAt: string | null
  createdAt: string
}

interface Invitation {
  id: string
  email: string
  role: string
  expiresAt: string
  createdAt: string
  expired: boolean
}

const ROLE_ICONS: Record<string, React.ElementType> = {
  admin: ShieldCheck,
  manager: Shield,
  agent: UserCog,
  viewer: Eye,
}

export default function TeamPage() {
  const queryClient = useQueryClient()
  const [showCreate, setShowCreate] = useState(false)
  const [showInvite, setShowInvite] = useState(false)
  const authProvider = useAuthStore((state) => state.provider)
  const [editUser, setEditUser] = useState<TeamUser | null>(null)
  const [deleteUser, setDeleteUser] = useState<TeamUser | null>(null)
  const [revokeInvite, setRevokeInvite] = useState<Invitation | null>(null)

  const { data: rawUsers, isLoading } = useQuery({
    queryKey: ['users'],
    queryFn: async () => {
      const res = (await usersApi.list()) as TeamUser[] | undefined
      if (!res) throw new Error('Empty response')
      return res
    },
  })

  const { data: rawInvitations } = useQuery({
    queryKey: ['invitations'],
    queryFn: async () => {
      const res = await api.get<Invitation[]>('/team/invitations')
      if (!res) return []
      return res
    },
  })
  const invitations: Invitation[] = Array.isArray(rawInvitations) ? rawInvitations : []
  const pendingInvitations = invitations.filter((inv) => !inv.expired)

  const users: TeamUser[] = Array.isArray(rawUsers) ? rawUsers : []
  const stats = {
    total: users.length,
    admins: users.filter((user) => user.role === 'admin').length,
    managers: users.filter((user) => user.role === 'manager').length,
    agents: users.filter((user) => user.role === 'agent').length,
    viewers: users.filter((user) => user.role === 'viewer').length,
    active: users.filter((user) => user.enabled).length,
  }

  const deleteMutation = useMutation({
    mutationFn: (id: number) => usersApi.remove(id),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['users'] })
      setDeleteUser(null)
      toast.success('User deleted')
    },
    onError: (e: Error) => toast.error(`Delete failed: ${e.message}`),
  })

  const toggleMutation = useMutation({
    mutationFn: ({ id, enabled }: { id: number; enabled: boolean }) =>
      usersApi.update(id, { enabled }),
    onSuccess: (_, v) => {
      queryClient.invalidateQueries({ queryKey: ['users'] })
      toast.success(v.enabled ? 'User enabled' : 'User disabled')
    },
    onError: (e: Error) => toast.error(`Update failed: ${e.message}`),
  })

  const revokeInviteMutation = useMutation({
    mutationFn: (id: string) => api.delete(`/team/invitations/${id}`),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['invitations'] })
      setRevokeInvite(null)
      toast.success('Invitation revoked')
    },
    onError: (e: Error) => toast.error(`Revoke failed: ${e.message}`),
  })

  if (isLoading) {
    return (
      <div className="flex items-center justify-center h-[60vh]">
        <Loader2 className="w-8 h-8 text-accent animate-spin" />
      </div>
    )
  }

  return (
    <div className="space-y-6 animate-fade-in">
      <section className="glass overflow-hidden rounded-lg">
        <div className="border-b border-border px-6 py-6">
          <div className="flex flex-col gap-5 lg:flex-row lg:items-end lg:justify-between">
            <div className="max-w-2xl">
              <h1 className="text-xl font-semibold tracking-tight">Team</h1>
              <p className="mt-1 text-[13px] text-text-secondary">
                Admins, managers, agents and viewers with access to this workspace.
              </p>
            </div>
            <div className="flex gap-2">
              {/* Email invitations are a Clerk feature; with built-in sign-in
                  an admin adds people directly with a starting password. */}
              {authProvider === 'clerk' && (
                <Button
                  variant="secondary"
                  onClick={() => setShowInvite(true)}
                  leftIcon={<Mail className="w-4 h-4" />}
                >
                  Invite
                </Button>
              )}
              <Button onClick={() => setShowCreate(true)} leftIcon={<Plus className="w-4 h-4" />}>
                Add User
              </Button>
            </div>
          </div>

          {/* Six boxed figures became one line. A role is not a state, so
              tinting admins red and agents green spent colour on identity —
              and in a new workspace it rendered 0 six times. */}
          {stats.total > 0 && (
            <p className="mt-4 text-[13px] text-text-secondary">
              <span className="tabular-nums text-text-primary">{stats.total}</span>{' '}
              {stats.total === 1 ? 'member' : 'members'}
              {' — '}
              <span className="tabular-nums">{stats.admins}</span> admin
              {stats.admins === 1 ? '' : 's'} &middot;{' '}
              <span className="tabular-nums">{stats.managers}</span> manager
              {stats.managers === 1 ? '' : 's'} &middot;{' '}
              <span className="tabular-nums">{stats.agents}</span> agent
              {stats.agents === 1 ? '' : 's'} &middot;{' '}
              <span className="tabular-nums">{stats.viewers}</span> viewer
              {stats.viewers === 1 ? '' : 's'}
              {stats.total - stats.active > 0 && (
                <>
                  {' · '}
                  <span className="tabular-nums text-warning">
                    {stats.total - stats.active}
                  </span>{' '}
                  disabled
                </>
              )}
            </p>
          )}
        </div>

        <div>
          <div className="overflow-hidden">
            <div className="border-b border-border px-5 py-4">
              <div className="flex flex-col gap-3 sm:flex-row sm:items-end sm:justify-between">
                <div>
                  <p className="text-sm font-semibold">Users</p>
                  <p className="text-xs text-text-muted">
                    {users.length} team members currently in the workspace
                  </p>
                </div>
                <div className="flex flex-wrap gap-2 text-xs text-text-muted">
                  <span className="rounded-full border border-border bg-surface px-2.5 py-1">
                    {stats.active} active
                  </span>
                  <span className="rounded-full border border-border bg-surface px-2.5 py-1">
                    {stats.total - stats.active} disabled
                  </span>
                </div>
              </div>
            </div>

            {users.length === 0 ? (
              <div className="px-5 py-16 text-center">
                <Users className="mx-auto h-10 w-10 text-text-muted/50 animate-pulse" />
                <p className="mt-4 text-sm font-medium text-text-primary">No team members yet</p>
                <p className="mt-2 text-sm text-text-secondary">
                  Add the first user to define who can manage the workspace, run campaigns, or work
                  leads.
                </p>
              </div>
            ) : (
              <div className="rounded-b-[28px]">
                <div className="space-y-3 p-4 md:hidden">
                  {users.map((user) => {
                    const RoleIcon = ROLE_ICONS[user.role] || User
                    return (
                      <div
                        key={user.id}
                        className="rounded-md border border-border bg-surface px-4 py-4"
                      >
                        <div className="flex items-start justify-between gap-3">
                          <div className="flex items-center gap-3">
                            <div className="flex h-10 w-10 items-center justify-center rounded-full bg-accent-muted">
                              <User className="h-4 w-4 text-accent" />
                            </div>
                            <div>
                              <p className="text-sm font-medium text-text-primary">{user.name}</p>
                              <p className="text-xs text-text-muted">{user.email}</p>
                            </div>
                          </div>
                          <Badge
                            variant={ROLE_VARIANTS[user.role]}
                            size="md"
                            className="capitalize"
                          >
                            <RoleIcon className="h-3 w-3" />
                            {user.role}
                          </Badge>
                        </div>
                        <div className="mt-4 flex items-center justify-between gap-3 text-xs">
                          <Button
                            variant="ghost"
                            size="sm"
                            onClick={() =>
                              toggleMutation.mutate({ id: user.id, enabled: !user.enabled })
                            }
                            className={cn(
                              'rounded-full',
                              user.enabled
                                ? 'bg-success-muted text-success hover:bg-success-muted/80'
                                : 'bg-surface-raised text-text-muted hover:bg-danger-muted hover:text-danger',
                            )}
                            leftIcon={
                              user.enabled ? (
                                <ToggleRight className="h-4 w-4" />
                              ) : (
                                <ToggleLeft className="h-4 w-4" />
                              )
                            }
                          >
                            {user.enabled ? 'Active' : 'Disabled'}
                          </Button>
                          <span className="text-text-muted">
                            {user.lastLoginAt ? formatRelativeTime(user.lastLoginAt) : 'Never'}
                          </span>
                        </div>
                        <div className="mt-4 flex items-center justify-end gap-2">
                          <Button
                            variant="ghost"
                            size="sm"
                            onClick={() => setEditUser(user)}
                            className="hover:bg-accent-muted hover:text-accent"
                            aria-label={`Edit ${user.name}`}
                          >
                            <UserCog className="h-4 w-4" />
                          </Button>
                          <Button
                            variant="ghost"
                            size="sm"
                            onClick={() => setDeleteUser(user)}
                            className="hover:bg-danger-muted hover:text-danger"
                            aria-label={`Delete ${user.name}`}
                          >
                            <Trash2 className="h-4 w-4" />
                          </Button>
                        </div>
                      </div>
                    )
                  })}
                </div>

                <div className="hidden overflow-x-auto md:block">
                  <table className="w-full">
                    <thead>
                      <tr className="border-b border-border text-xs uppercase tracking-wider text-text-muted">
                        <th className="px-5 py-3 text-left font-medium">User</th>
                        <th className="px-5 py-3 text-left font-medium">Role</th>
                        <th className="px-5 py-3 text-left font-medium">Status</th>
                        <th className="px-5 py-3 text-left font-medium">Last Login</th>
                        <th className="px-5 py-3 text-right font-medium">Actions</th>
                      </tr>
                    </thead>
                    <tbody>
                      {users.map((user) => {
                        const RoleIcon = ROLE_ICONS[user.role] || User
                        return (
                          <tr
                            key={user.id}
                            className="border-b border-border-subtle transition-colors hover:bg-surface-raised"
                          >
                            <td className="px-5 py-4">
                              <div className="flex items-center gap-3">
                                <div className="flex h-9 w-9 items-center justify-center rounded-full bg-accent-muted">
                                  <User className="w-4 h-4 text-accent" />
                                </div>
                                <div>
                                  <p className="text-sm font-medium">{user.name}</p>
                                  <p className="text-xs text-text-muted">{user.email}</p>
                                </div>
                              </div>
                            </td>
                            <td className="px-5 py-4">
                              <Badge
                                variant={ROLE_VARIANTS[user.role]}
                                size="md"
                                className="capitalize"
                              >
                                <RoleIcon className="w-3 h-3" />
                                {user.role}
                              </Badge>
                            </td>
                            <td className="px-5 py-4">
                              <Button
                                variant="ghost"
                                size="sm"
                                onClick={() =>
                                  toggleMutation.mutate({ id: user.id, enabled: !user.enabled })
                                }
                                className={cn(
                                  'rounded-full',
                                  user.enabled
                                    ? 'bg-success-muted text-success hover:bg-success-muted/80'
                                    : 'bg-surface-raised text-text-muted hover:bg-danger-muted hover:text-danger',
                                )}
                                leftIcon={
                                  user.enabled ? (
                                    <ToggleRight className="w-4 h-4" />
                                  ) : (
                                    <ToggleLeft className="w-4 h-4" />
                                  )
                                }
                              >
                                {user.enabled ? 'Active' : 'Disabled'}
                              </Button>
                            </td>
                            <td className="px-5 py-4 text-xs text-text-muted">
                              {user.lastLoginAt ? formatRelativeTime(user.lastLoginAt) : 'Never'}
                            </td>
                            <td className="px-5 py-4">
                              <div className="flex items-center justify-end gap-1">
                                <Button
                                  variant="ghost"
                                  size="sm"
                                  onClick={() => setEditUser(user)}
                                  className="hover:bg-accent-muted hover:text-accent"
                                  aria-label={`Edit ${user.name}`}
                                >
                                  <UserCog className="h-3.5 w-3.5" />
                                </Button>
                                <Button
                                  variant="ghost"
                                  size="sm"
                                  onClick={() => setDeleteUser(user)}
                                  className="hover:bg-danger-muted hover:text-danger"
                                  aria-label={`Delete ${user.name}`}
                                >
                                  <Trash2 className="h-3.5 w-3.5" />
                                </Button>
                              </div>
                            </td>
                          </tr>
                        )
                      })}
                    </tbody>
                  </table>
                </div>
              </div>
            )}
          </div>
        </div>
      </section>

      {/* Create / Edit Modal */}
      {(showCreate || editUser) && (
        <UserFormModal
          user={editUser}
          onClose={() => {
            setShowCreate(false)
            setEditUser(null)
          }}
        />
      )}

      <ConfirmDialog
        open={!!deleteUser}
        onOpenChange={(open) => {
          if (!open && !deleteMutation.isPending) setDeleteUser(null)
        }}
        title={deleteUser ? `Delete ${deleteUser.name}?` : 'Delete user?'}
        description={
          deleteUser
            ? `This permanently removes ${deleteUser.email}. Use this only when the person should no longer exist in the workspace — if they may return, disable the account instead.`
            : ''
        }
        confirmLabel="Delete user"
        destructive
        isLoading={deleteMutation.isPending}
        onConfirm={() => {
          if (deleteUser) deleteMutation.mutate(deleteUser.id)
        }}
      />

      {/* Pending Invitations */}
      {pendingInvitations.length > 0 && (
        <section className="glass overflow-hidden rounded-lg">
          <div className="border-b border-border bg-surface/80 px-5 py-4">
            <div className="flex items-center justify-between">
              <div>
                <p className="text-sm font-semibold">Pending invitations</p>
                <p className="mt-0.5 text-xs text-text-muted">
                  {pendingInvitations.length} invite{pendingInvitations.length !== 1 ? 's' : ''}{' '}
                  waiting to be accepted
                </p>
              </div>
              <Button
                variant="secondary"
                size="sm"
                onClick={() => setShowInvite(true)}
                leftIcon={<Send className="w-3.5 h-3.5" />}
              >
                Send another
              </Button>
            </div>
          </div>
          <div className="divide-y divide-border-subtle">
            {pendingInvitations.map((inv) => (
              <div key={inv.id} className="flex items-center justify-between gap-4 px-5 py-3">
                <div className="flex items-center gap-3 min-w-0">
                  <div className="flex h-8 w-8 items-center justify-center rounded-full bg-accent-muted/60 shrink-0">
                    <Mail className="h-3.5 w-3.5 text-accent" />
                  </div>
                  <div className="min-w-0">
                    <p className="text-sm font-medium truncate">{inv.email}</p>
                    <div className="flex items-center gap-2 mt-0.5">
                      <Badge
                        variant={ROLE_VARIANTS[inv.role as TeamUser['role']] ?? 'neutral'}
                        size="sm"
                        className="capitalize"
                      >
                        {inv.role}
                      </Badge>
                      <span className="flex items-center gap-1 text-[11px] text-text-muted">
                        <Clock className="h-3 w-3" />
                        expires {formatRelativeTime(inv.expiresAt)}
                      </span>
                    </div>
                  </div>
                </div>
                <Button
                  variant="ghost"
                  size="sm"
                  className="hover:text-danger hover:bg-danger-muted shrink-0"
                  onClick={() => setRevokeInvite(inv)}
                  aria-label="Revoke invitation"
                >
                  <Trash2 className="h-3.5 w-3.5" />
                </Button>
              </div>
            ))}
          </div>
        </section>
      )}

      {/* Invite User Modal */}
      {showInvite && <InviteUserModal onClose={() => setShowInvite(false)} />}

      <ConfirmDialog
        open={!!revokeInvite}
        onOpenChange={(open) => {
          if (!open) setRevokeInvite(null)
        }}
        title="Revoke invitation?"
        description={
          revokeInvite
            ? `The invite sent to ${revokeInvite.email} will be cancelled and the link will stop working.`
            : ''
        }
        confirmLabel="Revoke"
        destructive
        isLoading={revokeInviteMutation.isPending}
        onConfirm={() => {
          if (revokeInvite) revokeInviteMutation.mutate(revokeInvite.id)
        }}
      />
    </div>
  )
}

/* ── User Form Modal ── */
function UserFormModal({ user, onClose }: { user: TeamUser | null; onClose: () => void }) {
  const queryClient = useQueryClient()
  const isEdit = !!user

  const [form, setForm] = useState({
    name: user?.name || '',
    email: user?.email || '',
    password: '',
    role: user?.role || 'agent',
    phone: user?.phone || '',
  })

  const mutation = useMutation({
    mutationFn: (data: typeof form) =>
      isEdit
        ? // phone is always sent on edit — an empty string clears it, which is how
          // an admin turns phone login back off for someone.
          api.patch(`/users/${user!.id}`, {
            name: data.name,
            role: data.role,
            phone: data.phone.trim(),
            ...(data.password ? { password: data.password } : {}),
          })
        : api.post('/users', { ...data, phone: data.phone.trim() || undefined }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['users'] })
      toast.success(isEdit ? 'User updated successfully' : 'User created successfully')
      onClose()
    },
    onError: (e: Error) => toast.error(`Failed: ${e.message}`),
  })

  return (
    <div
      className="fixed inset-0 bg-black/60 backdrop-blur-sm z-50 flex items-center justify-center p-4"
      onClick={onClose}
    >
      <div
        className="bg-surface rounded-lg w-full max-w-md border border-border shadow-2xl animate-slide-up overflow-hidden"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="border-b border-border bg-linear-to-br from-accent-muted/30 to-surface px-6 py-5">
          <div className="flex items-start justify-between gap-4">
            <div>
              <p className="text-xs font-semibold uppercase tracking-[0.18em] text-text-muted">
                {isEdit ? 'Edit account' : 'New account'}
              </p>
              <h2 className="mt-2 text-lg font-semibold">{isEdit ? 'Edit User' : 'Add User'}</h2>
              <p className="mt-1 text-sm text-text-secondary">
                Set a role that matches the user’s daily scope.
              </p>
            </div>
            <Button variant="ghost" size="sm" onClick={onClose} aria-label="Close">
              <X className="h-4 w-4" />
            </Button>
          </div>
        </div>

        <div className="p-6 space-y-4">
          <div className="grid grid-cols-1 gap-2 rounded-md border border-border bg-surface-raised p-3 text-[11px] text-text-secondary sm:grid-cols-2">
            <div>
              <p className="font-semibold uppercase tracking-[0.16em] text-text-muted">Admin</p>
              <p className="mt-1 leading-5">Full workspace control, billing, and configuration.</p>
            </div>
            <div>
              <p className="font-semibold uppercase tracking-[0.16em] text-text-muted">
                Manager / Agent
              </p>
              <p className="mt-1 leading-5">
                Operational access with guardrails for daily execution.
              </p>
            </div>
          </div>
          <Input
            label="Name"
            required
            value={form.name}
            onChange={(e) => setForm({ ...form, name: e.target.value })}
          />
          {!isEdit && (
            <Input
              label="Email"
              required
              type="email"
              value={form.email}
              onChange={(e) => setForm({ ...form, email: e.target.value })}
            />
          )}
          <Input
            label={isEdit ? 'New Password (optional)' : 'Password'}
            required={!isEdit}
            type="password"
            value={form.password}
            onChange={(e) => setForm({ ...form, password: e.target.value })}
          />
          <UISelectField
            label="Role"
            value={form.role}
            onValueChange={(v) => setForm({ ...form, role: v as TeamUser['role'] })}
            options={[
              { value: 'admin', label: 'Admin — full workspace control' },
              { value: 'manager', label: 'Manager — oversight and review' },
              { value: 'agent', label: 'Agent — leads and inbox' },
              { value: 'viewer', label: 'Viewer — read-only' },
            ]}
          />
          <div>
            <Input
              label="Phone (optional)"
              type="tel"
              placeholder="+91 98765 43210"
              value={form.phone}
              onChange={(e) => setForm({ ...form, phone: e.target.value })}
            />
            <p className="mt-1.5 text-xs text-text-muted">
              Lets this person sign in with a one-time code instead of a password.
              {isEdit && form.phone ? ' Clear the field to switch them back to password-only.' : ''}
            </p>
          </div>
        </div>

        <div className="border-t border-border bg-surface/70 px-6 py-4 flex justify-end gap-2">
          <Button variant="ghost" onClick={onClose}>
            Cancel
          </Button>
          <Button
            onClick={() => mutation.mutate(form)}
            disabled={!form.name || (!isEdit && (!form.email || !form.password))}
            isLoading={mutation.isPending}
          >
            {isEdit ? 'Save' : 'Create'}
          </Button>
        </div>
      </div>
    </div>
  )
}

/* ── Invite User Modal ── */
interface InviteResult {
  invitation: Invitation
  emailSent: boolean
}

function InviteUserModal({ onClose }: { onClose: () => void }) {
  const queryClient = useQueryClient()
  const [form, setForm] = useState({ email: '', role: 'agent' })
  const [result, setResult] = useState<InviteResult | null>(null)

  const mutation = useMutation({
    mutationFn: () => api.post<InviteResult>('/team/invitations', form),
    onSuccess: (data) => {
      if (data) {
        setResult(data)
        queryClient.invalidateQueries({ queryKey: ['invitations'] })
      }
    },
    onError: (e: Error) => toast.error(`Failed: ${e.message}`),
  })

  if (result) {
    return (
      <div
        className="fixed inset-0 bg-black/60 backdrop-blur-sm z-50 flex items-center justify-center p-4"
        onClick={onClose}
      >
        <div
          className="bg-surface rounded-lg w-full max-w-sm border border-border shadow-2xl overflow-hidden animate-slide-up"
          onClick={(e) => e.stopPropagation()}
        >
          <div className="border-b border-border bg-linear-to-br from-success-muted/30 via-surface to-surface px-6 py-5">
            <div className="flex items-start justify-between gap-4">
              <div>
                <p className="text-[10px] font-semibold uppercase tracking-[0.22em] text-success">
                  Invitation sent
                </p>
                <h2 className="mt-2 text-lg font-semibold tracking-tight">Invite created</h2>
              </div>
              <Button variant="ghost" size="sm" onClick={onClose} aria-label="Close">
                <X className="w-4 h-4" />
              </Button>
            </div>
          </div>
          <div className="p-6 space-y-4">
            <div className="rounded-md border border-success/20 bg-success-muted/40 px-4 py-3 text-sm text-success">
              Email sent to <strong>{result.invitation.email}</strong>
            </div>
            <p className="text-xs text-text-muted">The invite expires in 30 days.</p>
          </div>
          <div className="border-t border-border bg-surface/70 px-6 py-4 flex justify-end">
            <Button onClick={onClose}>Done</Button>
          </div>
        </div>
      </div>
    )
  }

  return (
    <div
      className="fixed inset-0 bg-black/60 backdrop-blur-sm z-50 flex items-center justify-center p-4"
      onClick={onClose}
    >
      <div
        className="bg-surface rounded-lg w-full max-w-sm border border-border shadow-2xl overflow-hidden animate-slide-up"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="border-b border-border bg-linear-to-br from-accent-muted/25 via-surface to-surface px-6 py-5">
          <div className="flex items-start justify-between gap-4">
            <div>
              <p className="text-[10px] font-semibold uppercase tracking-[0.22em] text-text-muted">
                Team access
              </p>
              <h2 className="mt-2 text-lg font-semibold tracking-tight">Invite teammate</h2>
              <p className="mt-1 text-sm text-text-secondary">
                A magic link will be emailed to them. The link expires after 7 days.
              </p>
            </div>
            <Button variant="ghost" size="sm" onClick={onClose} aria-label="Close">
              <X className="w-4 h-4" />
            </Button>
          </div>
        </div>
        <div className="p-6 space-y-4">
          <Input
            label="Email address"
            required
            type="email"
            autoFocus
            value={form.email}
            onChange={(e) => setForm({ ...form, email: e.target.value })}
          />
          <UISelectField
            label="Role"
            value={form.role}
            onValueChange={(v) => setForm({ ...form, role: v })}
            options={[
              { value: 'admin', label: 'Admin — full workspace control' },
              { value: 'manager', label: 'Manager — oversight and review' },
              { value: 'agent', label: 'Agent — leads and inbox' },
              { value: 'viewer', label: 'Viewer — read-only' },
            ]}
          />
          {mutation.isError && (
            <div className="rounded-md border border-danger/20 bg-danger-muted/60 px-3 py-2 text-sm text-danger">
              {mutation.error instanceof Error ? mutation.error.message : 'Failed to send invite'}
            </div>
          )}
        </div>
        <div className="border-t border-border bg-surface/70 px-6 py-4 flex justify-end gap-2">
          <Button variant="ghost" onClick={onClose}>
            Cancel
          </Button>
          <Button
            onClick={() => mutation.mutate()}
            disabled={!form.email}
            isLoading={mutation.isPending}
            leftIcon={<Send className="w-3.5 h-3.5" />}
          >
            Send invite
          </Button>
        </div>
      </div>
    </div>
  )
}
