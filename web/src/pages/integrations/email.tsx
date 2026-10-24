import { useState } from 'react'
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { api } from '@/api/client'
import { useAuthStore } from '@/stores/auth-store'
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
import { Loader2, Mail, Plus, TestTube, Trash2 } from 'lucide-react'
import { InfoTile } from '@/components/integrations/integration-helpers'
import { emailAccountHealth, emailHealthSummary } from '@/lib/email-health'
import { toast } from '@/stores/toast-store'
import { EmailReceipts } from '@/components/integrations/email-receipts'

const RECEIVING_LABELS = {
  not_configured: 'Not connected',
  paused: 'Paused',
  error: 'Check connection',
  never_synced: 'Waiting for first sync',
  invalid_timestamp: 'Sync time unavailable',
  stale: 'Sync stale',
  current: 'Sync current',
}

export default function EmailSection() {
  const queryClient = useQueryClient()
  const [showAdd, setShowAdd] = useState(false)
  const [confirmDelete, setConfirmDelete] = useState<EmailAccount | null>(null)
  const [inboxAccount, setInboxAccount] = useState<EmailAccount | null>(null)
  const canConfigure = useAuthStore((state) => state.user?.role === 'admin')
  const dashboardScope = useAuthStore((state) => state.dashboardScope)

  const {
    data: rawAccounts,
    isLoading,
    error: accountsError,
    refetch,
  } = useQuery({
    queryKey: ['email-accounts', dashboardScope],
    queryFn: async () => {
      const res = await api.get<EmailAccount[]>('/email/accounts')
      if (!Array.isArray(res)) throw new Error('The email account response was incomplete.')
      return res
    },
    refetchInterval: 30_000,
  })

  const accounts = Array.isArray(rawAccounts) ? rawAccounts : []
  const summary = emailHealthSummary(accounts)

  const testMutation = useMutation({
    mutationFn: async (id: number) => {
      const result = await api.post<{ success: boolean; error?: string }>(
        `/email/accounts/${id}/test`,
      )
      if (!result?.success)
        throw new Error(result?.error || 'The sending provider could not be verified.')
      return result
    },
    onSuccess: () => toast.success('Sending provider verified. No email was sent.'),
    onError: (error: Error) => toast.error(error.message),
    onSettled: () => queryClient.invalidateQueries({ queryKey: ['email-accounts'] }),
  })

  const deleteMutation = useMutation({
    mutationFn: (id: number) => api.delete(`/email/accounts/${id}`),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ['email-accounts'] }),
    onError: (error: Error) => toast.error(error.message),
  })

  if (isLoading) {
    return (
      <div className="flex justify-center py-12">
        <Loader2 className="w-6 h-6 text-accent animate-spin" />
      </div>
    )
  }

  if (accountsError && !rawAccounts) {
    return (
      <p role="alert" className="rounded-md border border-danger/30 p-4 text-sm text-danger">
        Email accounts could not be loaded.{' '}
        <button className="min-h-11 underline" onClick={() => void refetch()}>
          Try again
        </button>
      </p>
    )
  }

  return (
    <div className="space-y-4">
      {accountsError && (
        <div role="alert" className="rounded-lg border border-danger/30 bg-surface p-4">
          <p className="text-sm text-text-secondary">
            Email connections could not be updated.
            {rawAccounts ? ' Showing previously loaded accounts.' : ''}
          </p>
          <Button className="mt-3" size="sm" variant="secondary" onClick={() => void refetch()}>
            Try again
          </Button>
        </div>
      )}
      <div className="rounded-lg border border-border bg-surface px-5 py-5 shadow-sm">
        <div className="flex flex-col gap-3 md:flex-row md:items-center md:justify-between">
          <div>
            <p className="text-sm font-semibold">Email connections</p>
            <p className="mt-1 text-sm text-text-secondary">
              Manage sending providers and reply inboxes separately. Sending verification does not
              verify receiving.
            </p>
          </div>
          <Button
            size="sm"
            disabled={!canConfigure}
            onClick={() => setShowAdd(true)}
            leftIcon={<Plus className="w-3.5 h-3.5" />}
          >
            Add Account
          </Button>
        </div>
      </div>

      <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 xl:grid-cols-4">
        <InfoTile
          label="Accounts"
          value={accountsError && !rawAccounts ? '—' : `${summary.total}`}
          detail={
            accountsError && !rawAccounts
              ? 'Connection data unavailable'
              : `${summary.enabled} enabled · ${summary.total - summary.enabled} disabled`
          }
        />
        <InfoTile
          label="Sending verified"
          value={
            accountsError && !rawAccounts ? '—' : `${summary.sendingVerified} / ${summary.enabled}`
          }
          detail="Enabled accounts with a verified provider"
        />
        <InfoTile
          label="Reply inbox checks"
          value={
            accountsError && !rawAccounts
              ? '—'
              : `${summary.receivingCurrent} / ${summary.receivingEnabled}`
          }
          detail={`${summary.receivingStale} stale · ${summary.receivingUnconfirmed} unconfirmed`}
        />
        <InfoTile
          label="Latest successful sync"
          value={
            accountsError && !rawAccounts
              ? 'Unavailable'
              : summary.lastSyncAt
                ? formatRelativeTime(summary.lastSyncAt)
                : 'No sync'
          }
          detail="Enabled reply inboxes; each inbox must sync within 15 minutes"
        />
      </div>

      {canConfigure && <EmailReceipts key={dashboardScope} accounts={accounts} />}

      <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
        {accounts.map((acc) => {
          const health = emailAccountHealth(acc)
          return (
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
                      'bg-surface-raised text-text-secondary',
                    )}
                  >
                    {acc.enabled ? 'Enabled' : 'Disabled'}
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
                    {acc.provider === 'brevo' ? 'API key' : 'SMTP / IMAP credentials'}
                  </span>
                </div>
              </div>
              <div className="p-5">
                <dl className="mb-4 space-y-2 text-xs">
                  <div className="flex flex-wrap justify-between gap-2">
                    <dt className="text-text-muted">Sending provider</dt>
                    <dd
                      className={
                        health.sending === 'verified'
                          ? 'text-success'
                          : health.sending === 'error'
                            ? 'text-danger'
                            : 'text-text-secondary'
                      }
                    >
                      {health.sending === 'verified'
                        ? 'Verified'
                        : health.sending === 'error'
                          ? 'Verification failed'
                          : health.sending === 'paused'
                            ? 'Paused'
                            : 'Not verified'}
                    </dd>
                  </div>
                  <div className="flex flex-wrap justify-between gap-2">
                    <dt className="text-text-muted">Receiving replies</dt>
                    <dd
                      className={
                        health.receiving === 'current'
                          ? 'text-success'
                          : ['stale', 'error', 'invalid_timestamp'].includes(health.receiving)
                            ? 'text-warning'
                            : 'text-text-secondary'
                      }
                    >
                      {RECEIVING_LABELS[health.receiving]}
                    </dd>
                  </div>
                </dl>
                <p className="mb-3 text-xs text-text-secondary">
                  {acc.imapHost
                    ? `IMAP: ${acc.imapUser || 'Mailbox address missing'} · ${health.lastSyncAt ? `last success ${formatRelativeTime(health.lastSyncAt)}` : 'no confirmed successful sync'}`
                    : 'Connect a reply inbox to receive customer messages.'}
                </p>
                {acc.lastError && (
                  <p className="mb-3 break-words text-xs text-danger">
                    Last reported error: {acc.lastError}
                  </p>
                )}
                <div className="flex flex-wrap gap-2">
                  <Button
                    variant="secondary"
                    size="sm"
                    disabled={!canConfigure}
                    onClick={() => setInboxAccount(acc)}
                  >
                    {acc.imapHost === 'imap.gmail.com'
                      ? 'Gmail inbox settings'
                      : 'Set up Gmail via IMAP'}
                  </Button>
                  <Button
                    variant="secondary"
                    size="sm"
                    isLoading={testMutation.isPending && testMutation.variables === acc.id}
                    disabled={!canConfigure}
                    onClick={() => testMutation.mutate(acc.id)}
                    leftIcon={<TestTube className="w-3.5 h-3.5" />}
                  >
                    Verify sending
                  </Button>
                  <Button
                    variant="ghost"
                    size="sm"
                    className="hover:text-danger hover:bg-danger-muted"
                    disabled={!canConfigure}
                    onClick={() => setConfirmDelete(acc)}
                    leftIcon={<Trash2 className="w-3.5 h-3.5" />}
                  >
                    Delete
                  </Button>
                </div>
              </div>
            </div>
          )
        })}
      </div>

      {accounts.length === 0 && !accountsError && (
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
        <GmailInboxModal account={inboxAccount} onClose={() => setInboxAccount(null)} />
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

function GmailInboxModal({ account, onClose }: { account: EmailAccount; onClose: () => void }) {
  const queryClient = useQueryClient()
  const [user, setUser] = useState(account.imapHost === 'imap.gmail.com' ? account.imapUser : '')
  const [password, setPassword] = useState('')
  const mutation = useMutation({
    mutationFn: () =>
      api.patch(`/email/accounts/${account.id}`, {
        imapHost: 'imap.gmail.com',
        imapPort: 993,
        imapSecure: true,
        imapUser: user.trim(),
        imapPass: password.replace(/\s/g, ''),
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
          <DialogTitle>Gmail reply inbox · IMAP</DialogTitle>
          <DialogDescription>
            This connection uses a Google app password. Google OAuth mailbox authorization is not
            available yet.
          </DialogDescription>
        </DialogHeader>
        <form
          className="space-y-4 p-6"
          onSubmit={(event) => {
            event.preventDefault()
            mutation.mutate()
          }}
        >
          {account.imapHost && account.imapHost !== 'imap.gmail.com' && (
            <p className="text-xs leading-5 text-warning">
              Saving replaces this account’s receiving connection at {account.imapHost} with Gmail
              IMAP. The sending provider stays the same.
            </p>
          )}
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
          <p className="text-xs text-text-secondary">
            Connecting grants Outbound OS access to this Gmail mailbox. It reads inbox messages to
            match lead replies and saves matching replies in your CRM. The app password is encrypted
            on your server. Enabled accounts are checked every 5 minutes. New inboxes initially
            check the last 24 hours. Saving settings does not test the Gmail connection; check the
            account’s sync status after the next scheduled check.
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
              Save inbox settings
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
        smtpHost: form.provider === 'custom' ? form.smtpHost : providers?.[form.provider]?.smtpHost,
        smtpPort: form.provider === 'custom' ? form.smtpPort : providers?.[form.provider]?.smtpPort,
        smtpSecure:
          form.provider === 'custom'
            ? Number(form.smtpPort) === 465
            : providers?.[form.provider]?.smtpSecure,
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
        await api.get<Record<string, { smtpHost: string; smtpPort: number; smtpSecure: boolean }>>(
          '/email/providers',
        )
      if (!res) throw new Error('Empty response')
      return res
    },
  })

  const providerList = providers
    ? Object.entries(providers).map(([id, config]) => ({
        id,
        name:
          id === 'gmail'
            ? 'Gmail · app password'
            : id === 'outlook'
              ? 'Outlook · manual credentials'
              : id.charAt(0).toUpperCase() + id.slice(1),
        smtpHost: config.smtpHost,
        smtpPort: config.smtpPort,
      }))
    : []

  const mutation = useMutation({
    mutationFn: () =>
      api.post('/email/accounts', {
        ...form,
        ...(form.provider === 'custom'
          ? { smtpSecure: Number(form.smtpPort) === 465 }
          : { smtpHost: undefined, smtpPort: undefined }),
      }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['email-accounts'] })
      onClose()
    },
  })
  const pending = mutation.isPending || testConfigMutation.isPending
  function changeForm(updates: Partial<typeof form>) {
    setTestResult(null)
    setForm((current) => ({ ...current, ...updates }))
  }

  return (
    <Dialog
      open
      onOpenChange={(open) => {
        if (!open && !pending) onClose()
      }}
    >
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Add email account</DialogTitle>
          <DialogDescription>
            Connect a sending provider with an API key or manual mail credentials.
          </DialogDescription>
        </DialogHeader>
        <fieldset disabled={pending} className="p-6 space-y-3">
          <UISelectField
            label="Provider"
            value={form.provider}
            disabled={pending}
            onValueChange={(v) => changeForm({ provider: v })}
            options={[
              ...providerList.map((p) => ({ value: p.id, label: p.name })),
              { value: 'custom', label: 'Custom SMTP' },
            ]}
          />
          {(form.provider === 'gmail' || form.provider === 'outlook') && (
            <p className="text-xs leading-5 text-text-secondary">
              This is a manual SMTP/IMAP connection. It does not open Google or Microsoft OAuth.
              {form.provider === 'gmail' &&
                ' Use a Google app password, not your normal account password.'}
            </p>
          )}
          <Input
            label="Name"
            value={form.name}
            onChange={(e) => changeForm({ name: e.target.value })}
          />
          <Input
            label="Email"
            type="email"
            value={form.email}
            onChange={(e) => changeForm({ email: e.target.value })}
            required
          />
          {form.provider === 'custom' && (
            <>
              <Input
                label="SMTP Host"
                value={form.smtpHost}
                onChange={(e) => changeForm({ smtpHost: e.target.value })}
              />
              <Input
                label="SMTP Port"
                value={form.smtpPort}
                onChange={(e) => changeForm({ smtpPort: e.target.value })}
              />
            </>
          )}
          {form.provider !== 'brevo' && (
            <Input
              label="SMTP User"
              value={form.smtpUser}
              onChange={(e) => changeForm({ smtpUser: e.target.value })}
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
            onChange={(e) => changeForm({ smtpPass: e.target.value })}
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
              {testResult.success
                ? 'Sending credentials checked. Save the account, then verify it to enable sending.'
                : testResult.error}
            </div>
          )}
        </fieldset>
        <div className="border-t border-border bg-surface/70 px-6 py-4 flex justify-between gap-2">
          <Button
            variant="secondary"
            size="sm"
            disabled={
              mutation.isPending ||
              !form.smtpPass ||
              (form.provider === 'brevo' ? !form.email : !form.smtpUser) ||
              (form.provider !== 'custom' && !providers)
            }
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
            <Button variant="ghost" disabled={pending} onClick={onClose}>
              Cancel
            </Button>
            <Button
              onClick={() => mutation.mutate()}
              disabled={
                testConfigMutation.isPending ||
                !form.email ||
                !form.smtpPass ||
                (form.provider !== 'brevo' && !form.smtpUser)
              }
              isLoading={mutation.isPending}
            >
              Add
            </Button>
          </div>
        </div>
      </DialogContent>
    </Dialog>
  )
}
