import { useState } from 'react'
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { api } from '@/api/client'
import {
  Button,
  Input,
  SelectField as UISelectField,
  ConfirmDialog,
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
} from '@/components/ui'
import type { EmailAccount } from '@/api/types'
import { cn, formatRelativeTime } from '@/lib/utils'
import { Loader2, Mail, Plus, TestTube, Trash2, X } from 'lucide-react'
import { InfoTile } from '@/components/integrations/integration-helpers'

export default function EmailSection() {
  const queryClient = useQueryClient()
  const [showAdd, setShowAdd] = useState(false)
  const [confirmDelete, setConfirmDelete] = useState<EmailAccount | null>(null)
  const [inboxAccount, setInboxAccount] = useState<EmailAccount | null>(null)
  const [inboxResult, setInboxResult] = useState<string | null>(null)

  const { data: rawAccounts, isLoading } = useQuery({
    queryKey: ['email-accounts'],
    queryFn: async () => {
      const res = await api.get<EmailAccount[]>('/email/accounts')
      if (!res) throw new Error('Empty response')
      return res
    },
    refetchInterval: 30_000,
  })

  const accounts = Array.isArray(rawAccounts) ? rawAccounts : []

  const testMutation = useMutation({
    mutationFn: (id: number) => api.post(`/email/accounts/${id}/test`),
  })

  const deleteMutation = useMutation({
    mutationFn: (id: number) => api.delete(`/email/accounts/${id}`),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ['email-accounts'] }),
  })

  const syncMutation = useMutation({
    mutationFn: (id: number) => api.post<{ replies: number }>(`/email/accounts/${id}/sync-inbox`),
    onSuccess: (result) => {
      setInboxResult(
        `Inbox checked successfully. ${result?.replies ?? 0} new lead replies imported.`,
      )
      queryClient.invalidateQueries({ queryKey: ['email-accounts'] })
    },
    onError: (error: Error) => setInboxResult(error.message),
  })

  if (isLoading) {
    return (
      <div className="flex justify-center py-12">
        <Loader2 className="w-6 h-6 text-accent animate-spin" />
      </div>
    )
  }

  return (
    <div className="space-y-4">
      <div className="rounded-lg border border-border bg-surface px-5 py-5 shadow-sm">
        <div className="flex flex-col gap-3 md:flex-row md:items-center md:justify-between">
          <div>
            <p className="text-sm font-semibold">Email delivery surface</p>
            <p className="mt-1 text-sm text-text-secondary">
              {accounts.length} email accounts configured for sending and testing.
            </p>
          </div>
          <Button
            size="sm"
            onClick={() => setShowAdd(true)}
            leftIcon={<Plus className="w-3.5 h-3.5" />}
          >
            Add Account
          </Button>
        </div>
      </div>

      <div className="grid grid-cols-1 gap-3 sm:grid-cols-3">
        <InfoTile label="Accounts" value={`${accounts.length}`} detail="Total configured inboxes" />
        <InfoTile
          label="Enabled"
          value={`${accounts.filter((acc) => acc.enabled).length}`}
          detail="Active sending inboxes"
        />
        <InfoTile
          label="Last Sync"
          value={accounts.some((acc) => acc.lastSyncAt) ? 'Recent' : 'Never'}
          detail="Provider sync health"
        />
      </div>

      <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
        {accounts.map((acc) => (
          <div key={acc.id} className="card-hover glass overflow-hidden rounded-lg">
            <div className="border-b border-border bg-surface/70 p-5">
              <div className="flex items-center justify-between mb-3">
                <div className="flex items-center gap-2.5 min-w-0">
                  <div className="flex h-9 w-9 items-center justify-center rounded-md bg-accent-muted">
                    <Mail className="w-4 h-4 text-accent" />
                  </div>
                  <div className="min-w-0">
                    <p className="text-sm font-semibold truncate">{acc.name || acc.email}</p>
                    <p className="text-text-muted text-xs truncate">{acc.email}</p>
                  </div>
                </div>
                <span
                  className={cn(
                    'flex items-center gap-1.5 rounded-full px-2.5 py-1 text-[10px] font-semibold uppercase',
                    acc.enabled
                      ? 'bg-success-muted text-success'
                      : 'bg-surface-raised text-text-muted',
                  )}
                >
                  {acc.enabled ? (
                    <div className="h-1.5 w-1.5 rounded-full bg-success animate-pulse" />
                  ) : (
                    <div className="h-1.5 w-1.5 rounded-full bg-text-muted" />
                  )}
                  {acc.enabled ? 'Active' : 'Disabled'}
                </span>
              </div>

              <div className="flex flex-wrap gap-2 text-[11px]">
                <span className="rounded-full bg-surface-raised px-2.5 py-1 text-text-muted">
                  {acc.provider}
                </span>
                <span className="rounded-full bg-surface-raised px-2.5 py-1 text-text-muted">
                  {acc.sentToday} sent today
                </span>
                <span className="rounded-full bg-surface-raised px-2.5 py-1 text-text-muted">
                  Last sync {acc.lastSyncAt ? formatRelativeTime(acc.lastSyncAt) : 'Never'}
                </span>
              </div>
            </div>
            <div className="p-5">
              <p className="mb-3 text-xs text-text-secondary">
                {acc.imapHost
                  ? `Replies: ${acc.imapUser} · ${acc.lastSyncAt ? `checked ${formatRelativeTime(acc.lastSyncAt)}` : 'first sync pending'}`
                  : 'Reply inbox not connected'}
              </p>
              {acc.imapHost && acc.lastError && (
                <p className="mb-3 text-xs text-danger">{acc.lastError}</p>
              )}
              <div className="flex flex-wrap gap-2">
                <Button variant="secondary" size="sm" onClick={() => setInboxAccount(acc)}>
                  {acc.imapHost ? 'Inbox settings' : 'Connect Gmail inbox'}
                </Button>
                {acc.imapHost && (
                  <Button
                    variant="secondary"
                    size="sm"
                    isLoading={syncMutation.isPending && syncMutation.variables === acc.id}
                    disabled={syncMutation.isPending}
                    onClick={() => {
                      setInboxResult(null)
                      syncMutation.mutate(acc.id)
                    }}
                  >
                    Sync replies now
                  </Button>
                )}
                <Button
                  variant="secondary"
                  size="sm"
                  isLoading={testMutation.isPending}
                  onClick={() => testMutation.mutate(acc.id)}
                  leftIcon={<TestTube className="w-3.5 h-3.5" />}
                >
                  Test
                </Button>
                <Button
                  variant="ghost"
                  size="sm"
                  className="hover:text-danger hover:bg-danger-muted"
                  onClick={() => setConfirmDelete(acc)}
                  leftIcon={<Trash2 className="w-3.5 h-3.5" />}
                >
                  Delete
                </Button>
              </div>
            </div>
          </div>
        ))}
      </div>

      {inboxResult && (
        <p role="status" className="rounded-md border border-border p-3 text-sm">
          {inboxResult}
        </p>
      )}

      {accounts.length === 0 && (
        <div className="rounded-md border border-dashed border-border bg-surface px-6 py-12 text-center">
          <Mail className="mx-auto mb-2 h-10 w-10 text-text-muted/40 animate-pulse" />
          <p className="text-text-secondary text-sm">No email accounts configured</p>
          <p className="mt-1 text-xs text-text-muted">
            Add a provider to test SMTP and outbound delivery from this workspace.
          </p>
        </div>
      )}

      {showAdd && <AddEmailModal onClose={() => setShowAdd(false)} />}
      {inboxAccount && (
        <GmailInboxModal
          account={inboxAccount}
          accounts={accounts}
          onClose={() => setInboxAccount(null)}
        />
      )}

      <ConfirmDialog
        open={!!confirmDelete}
        onOpenChange={(open) => {
          if (!open) setConfirmDelete(null)
        }}
        title="Delete email account?"
        description={confirmDelete ? `${confirmDelete.email} will be permanently removed.` : ''}
        confirmLabel="Delete"
        destructive
        onConfirm={() => {
          if (confirmDelete) deleteMutation.mutate(confirmDelete.id)
          setConfirmDelete(null)
        }}
      />
    </div>
  )
}

function GmailInboxModal({
  account,
  accounts,
  onClose,
}: {
  account: EmailAccount
  accounts: EmailAccount[]
  onClose: () => void
}) {
  const queryClient = useQueryClient()
  const [user, setUser] = useState(account.imapHost === 'imap.gmail.com' ? account.imapUser : '')
  const [password, setPassword] = useState('')
  const [accountIds, setAccountIds] = useState([account.id])
  const mutation = useMutation({
    mutationFn: () =>
      api.post(`/email/accounts/${account.id}/gmail-inbox`, {
        user: user.trim(),
        appPassword: password,
        accountIds,
      }),
    onSuccess: () => {
      setPassword('')
      queryClient.invalidateQueries({ queryKey: ['email-accounts'] })
      onClose()
    },
  })

  return (
    <Dialog
      open
      onOpenChange={(open) => {
        if (!open && !mutation.isPending) onClose()
      }}
    >
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Connect Gmail reply inbox</DialogTitle>
          <DialogDescription>
            Receive replies here while keeping your existing sending provider.
          </DialogDescription>
        </DialogHeader>
        <form
          className="space-y-4 p-6"
          onSubmit={(event) => {
            event.preventDefault()
            mutation.mutate()
          }}
        >
          <Input
            label="Gmail inbox address"
            type="email"
            required
            value={user}
            autoComplete="username"
            disabled={mutation.isPending}
            onChange={(event) => setUser(event.target.value)}
          />
          <Input
            label="Gmail app password"
            type="password"
            required
            value={password}
            autoComplete="new-password"
            disabled={mutation.isPending}
            description="Use a Google app password, not your normal Gmail password."
            onChange={(event) => setPassword(event.target.value)}
          />
          <p className="text-xs text-text-secondary">
            Enable Google 2-Step Verification, then create an app password named Outbound OS at{' '}
            <a
              className="text-accent underline"
              href="https://myaccount.google.com/apppasswords"
              target="_blank"
              rel="noreferrer"
            >
              Google App Passwords
            </a>
            .
          </p>
          <fieldset disabled={mutation.isPending} className="space-y-2">
            <legend className="mb-2 text-sm font-medium">
              Senders whose replies arrive in this Gmail inbox
            </legend>
            {accounts.map((sender) => (
              <label key={sender.id} className="flex items-center gap-2 text-sm">
                <input
                  type="checkbox"
                  checked={accountIds.includes(sender.id)}
                  disabled={sender.id === account.id}
                  onChange={(event) =>
                    setAccountIds((ids) =>
                      event.target.checked
                        ? [...ids, sender.id]
                        : ids.filter((id) => id !== sender.id),
                    )
                  }
                />
                {sender.email}
              </label>
            ))}
          </fieldset>
          <p className="text-xs text-text-secondary">
            Connecting grants Outbound OS access to this Gmail mailbox. It reads inbox messages to
            match lead replies and saves matching replies in your CRM. The app password is encrypted
            on your server. Replies are checked every 5 minutes; the first sync checks the last 24
            hours.
          </p>
          {mutation.error && (
            <p role="alert" className="text-sm text-danger">
              {mutation.error.message}
            </p>
          )}
          <div className="flex justify-end gap-2">
            <Button type="button" variant="ghost" disabled={mutation.isPending} onClick={onClose}>
              Cancel
            </Button>
            <Button
              type="submit"
              isLoading={mutation.isPending}
              disabled={!user.trim() || !/^[a-zA-Z]{16}$/.test(password.replace(/\s/g, ''))}
            >
              Test and connect inbox
            </Button>
          </div>
        </form>
      </DialogContent>
    </Dialog>
  )
}

function AddEmailModal({ onClose }: { onClose: () => void }) {
  const queryClient = useQueryClient()
  const [form, setForm] = useState({
    provider: 'gmail',
    email: '',
    name: '',
    smtpHost: '',
    smtpPort: '587',
    smtpUser: '',
    smtpPass: '',
  })
  const [testResult, setTestResult] = useState<{ success: boolean; error?: string } | null>(null)

  const testConfigMutation = useMutation({
    mutationFn: () =>
      api.post<{ success: boolean; error?: string }>('/email/accounts/test-config', {
        provider: form.provider,
        email: form.email,
        smtpHost: form.smtpHost || (form.provider === 'gmail' ? 'smtp.gmail.com' : ''),
        smtpPort: form.smtpPort,
        smtpUser: form.smtpUser,
        smtpPass: form.smtpPass,
      }),
    onSuccess: (data) => setTestResult(data ?? null),
    onError: (e: Error) => setTestResult({ success: false, error: e.message }),
  })

  const { data: providers } = useQuery({
    queryKey: ['email-providers'],
    queryFn: async () => {
      const res =
        await api.get<Record<string, { smtpHost: string; smtpPort: number }>>('/email/providers')
      if (!res) throw new Error('Empty response')
      return res
    },
  })

  const providerList = providers
    ? Object.entries(providers).map(([id, config]) => ({
        id,
        name: id.charAt(0).toUpperCase() + id.slice(1),
        smtpHost: config.smtpHost,
        smtpPort: config.smtpPort,
      }))
    : []

  const mutation = useMutation({
    mutationFn: () => api.post('/email/accounts', form),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['email-accounts'] })
      onClose()
    },
  })

  return (
    <div
      className="fixed inset-0 bg-black/60 backdrop-blur-sm z-50 flex items-center justify-center p-4"
      onClick={onClose}
    >
      <div
        className="bg-surface rounded-lg w-full max-w-md max-h-[85vh] overflow-y-auto border border-border shadow-2xl overflow-hidden animate-slide-up"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="border-b border-border bg-linear-to-br from-accent-muted/25 via-surface to-surface px-6 py-5">
          <div className="flex items-start justify-between gap-4">
            <div>
              <p className="text-[10px] font-semibold uppercase tracking-[0.22em] text-text-muted">
                Email integration
              </p>
              <h2 className="mt-2 text-lg font-semibold tracking-tight">Add Email Account</h2>
              <p className="mt-1 text-sm text-text-secondary">
                Connect your sending provider and verify its credentials.
              </p>
            </div>
            <Button variant="ghost" size="sm" onClick={onClose} aria-label="Close">
              <X className="w-4 h-4" />
            </Button>
          </div>
        </div>
        <div className="p-6 space-y-3">
          <UISelectField
            label="Provider"
            value={form.provider}
            onValueChange={(v) => setForm({ ...form, provider: v })}
            options={[
              ...providerList.map((p) => ({ value: p.id, label: p.name })),
              { value: 'custom', label: 'Custom SMTP' },
            ]}
          />
          <Input
            label="Name"
            value={form.name}
            onChange={(e) => setForm({ ...form, name: e.target.value })}
          />
          <Input
            label="Email"
            type="email"
            value={form.email}
            onChange={(e) => setForm({ ...form, email: e.target.value })}
            required
          />
          {form.provider === 'custom' && (
            <>
              <Input
                label="SMTP Host"
                value={form.smtpHost}
                onChange={(e) => setForm({ ...form, smtpHost: e.target.value })}
              />
              <Input
                label="SMTP Port"
                value={form.smtpPort}
                onChange={(e) => setForm({ ...form, smtpPort: e.target.value })}
              />
            </>
          )}
          {form.provider !== 'brevo' && (
            <Input
              label="SMTP User"
              value={form.smtpUser}
              onChange={(e) => setForm({ ...form, smtpUser: e.target.value })}
            />
          )}
          <Input
            label={form.provider === 'brevo' ? 'Brevo API key' : 'SMTP Password'}
            description={
              form.provider === 'brevo'
                ? 'Use an API key from the Brevo account where this sender is verified.'
                : undefined
            }
            autoComplete="new-password"
            type="password"
            value={form.smtpPass}
            onChange={(e) => setForm({ ...form, smtpPass: e.target.value })}
          />
          {mutation.error && (
            <p role="alert" className="text-sm text-danger">
              {mutation.error.message}
            </p>
          )}
          {/* Test result banner */}
          {testResult && (
            <div
              className={cn(
                'rounded-md border px-4 py-3 text-sm',
                testResult.success
                  ? 'border-success/20 bg-success-muted/40 text-success'
                  : 'border-danger/20 bg-danger-muted/40 text-danger',
              )}
            >
              {testResult.success ? '✓ Sending provider verified' : `✗ ${testResult.error}`}
            </div>
          )}
        </div>
        <div className="border-t border-border bg-surface/70 px-6 py-4 flex justify-between gap-2">
          <Button
            variant="secondary"
            size="sm"
            disabled={!form.smtpPass || (form.provider === 'brevo' ? !form.email : !form.smtpUser)}
            isLoading={testConfigMutation.isPending}
            onClick={() => {
              setTestResult(null)
              testConfigMutation.mutate()
            }}
            leftIcon={<TestTube className="w-3.5 h-3.5" />}
          >
            Test connection
          </Button>
          <div className="flex gap-2">
            <Button variant="ghost" onClick={onClose}>
              Cancel
            </Button>
            <Button
              onClick={() => mutation.mutate()}
              disabled={!form.email || !form.smtpPass}
              isLoading={mutation.isPending}
            >
              Add
            </Button>
          </div>
        </div>
      </div>
    </div>
  )
}
