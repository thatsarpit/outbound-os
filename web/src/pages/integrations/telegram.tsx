import { useMemo, useState } from 'react'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { AlertTriangle, CheckCircle2, RefreshCw, Send, ShieldCheck, Trash2 } from 'lucide-react'

import { api } from '@/api/client'
import { Button, ConfirmDialog, Input } from '@/components/ui'
import { InfoTile } from '@/components/integrations/integration-helpers'
import { cn, formatRelativeTime } from '@/lib/utils'

type TelegramStatus =
  | 'disconnected'
  | 'code_required'
  | 'password_required'
  | 'connected'
  | 'error'

interface TelegramAccount {
  id: number
  name: string
  apiId: number
  phoneNumber: string
  username: string
  displayName: string
  enabled: boolean
  manualOnly: boolean
  status: TelegramStatus
  lastError: string | null
  lastConnectedAt: string | null
  dailyLimit: number
  sentToday: number
  hasCredentials: boolean
  hasSession: boolean
}

interface ConnectionResult {
  account: TelegramAccount
  delivery?: 'telegram' | 'sms'
  passwordRequired?: boolean
}

const STATUS_LABELS: Record<TelegramStatus, string> = {
  disconnected: 'Disconnected',
  code_required: 'Code required',
  password_required: 'Password required',
  connected: 'Connected',
  error: 'Needs attention',
}

export default function TelegramIntegrationPage() {
  const queryClient = useQueryClient()
  const [form, setForm] = useState({
    name: 'Outbound OS',
    apiId: '',
    apiHash: '',
    phoneNumber: '',
  })
  const [verificationCode, setVerificationCode] = useState('')
  const [twoFactorPassword, setTwoFactorPassword] = useState('')
  const [delivery, setDelivery] = useState<'telegram' | 'sms' | null>(null)
  const [testMessage, setTestMessage] = useState({ accountId: '', peer: '', message: '' })
  const [sendResult, setSendResult] = useState<string | null>(null)
  const [confirmDelete, setConfirmDelete] = useState<TelegramAccount | null>(null)

  const { data, isLoading } = useQuery({
    queryKey: ['telegram-accounts'],
    queryFn: async () => (await api.get<TelegramAccount[]>('/telegram/accounts')) || [],
  })
  const accounts = useMemo(() => (Array.isArray(data) ? data : []), [data])
  const pendingAccount = useMemo(
    () => accounts.find((account) => ['code_required', 'password_required'].includes(account.status)),
    [accounts],
  )
  const connectedAccounts = accounts.filter((account) => account.status === 'connected' && account.enabled)

  const refresh = async () => {
    await queryClient.invalidateQueries({ queryKey: ['telegram-accounts'] })
  }

  const connectMutation = useMutation({
    mutationFn: () =>
      api.post<ConnectionResult>('/telegram/accounts/connect', {
        ...form,
        accountId: pendingAccount?.id,
      }),
    onSuccess: async (result) => {
      setDelivery(result?.delivery || null)
      setVerificationCode('')
      await refresh()
    },
  })

  const codeMutation = useMutation({
    mutationFn: () =>
      api.post<ConnectionResult>(`/telegram/accounts/${pendingAccount?.id}/code`, {
        code: verificationCode,
      }),
    onSuccess: async (result) => {
      setVerificationCode('')
      if (!result?.passwordRequired) setForm((current) => ({ ...current, apiHash: '' }))
      await refresh()
    },
  })

  const passwordMutation = useMutation({
    mutationFn: () =>
      api.post<ConnectionResult>(`/telegram/accounts/${pendingAccount?.id}/password`, {
        password: twoFactorPassword,
      }),
    onSuccess: async () => {
      setTwoFactorPassword('')
      setForm((current) => ({ ...current, apiHash: '' }))
      await refresh()
    },
  })

  const checkMutation = useMutation({
    mutationFn: (id: number) => api.post(`/telegram/accounts/${id}/check`),
    onSuccess: refresh,
  })

  const deleteMutation = useMutation({
    mutationFn: (id: number) => api.delete(`/telegram/accounts/${id}`),
    onSuccess: async () => {
      setConfirmDelete(null)
      await refresh()
    },
  })

  const sendMutation = useMutation({
    mutationFn: () =>
      api.post<{ messageId: string }>('/telegram/send', {
        accountId: Number(testMessage.accountId),
        peer: testMessage.peer,
        message: testMessage.message,
      }),
    onSuccess: async (result) => {
      setSendResult(result?.messageId ? `Sent as Telegram message ${result.messageId}` : 'Message sent')
      setTestMessage((current) => ({ ...current, message: '' }))
      await refresh()
    },
    onError: () => setSendResult(null),
  })

  if (isLoading) {
    return <div className="py-12 text-center text-sm text-text-muted">Loading Telegram connection…</div>
  }

  return (
    <div className="space-y-5">
      <div className="grid grid-cols-1 gap-3 sm:grid-cols-3">
        <InfoTile label="Accounts" value={String(accounts.length)} detail="Connected user identities" />
        <InfoTile
          label="Ready"
          value={String(connectedAccounts.length)}
          detail="Available for manual messages"
        />
        <InfoTile
          label="Policy"
          value="Manual only"
          detail="Excluded from campaign automation"
        />
      </div>

      <div className="rounded-lg border border-border bg-surface p-5 shadow-sm">
        <div className="flex items-start gap-3">
          <div className="mt-0.5 rounded-md bg-accent-muted p-2 text-accent">
            <ShieldCheck className="h-4 w-4" />
          </div>
          <div>
            <p className="text-sm font-semibold">Connected-account safety</p>
            <p className="mt-1 max-w-3xl text-sm leading-6 text-text-secondary">
              Telegram is enabled for deliberate one-to-one messages only. The API hash and login
              session are encrypted at rest, never returned by the API, and Telegram is not offered
              as a campaign channel.
            </p>
          </div>
        </div>
      </div>

      {accounts.length > 0 && (
        <div className="grid grid-cols-1 gap-4 lg:grid-cols-2">
          {accounts.map((account) => {
            const connected = account.status === 'connected'
            return (
              <div key={account.id} className="rounded-lg border border-border bg-surface p-5 shadow-sm">
                <div className="flex items-start justify-between gap-4">
                  <div className="flex min-w-0 items-center gap-3">
                    <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-md bg-[#229ED9]/10 text-[#229ED9]">
                      <Send className="h-4 w-4" />
                    </div>
                    <div className="min-w-0">
                      <p className="truncate text-sm font-semibold">{account.displayName || account.name}</p>
                      <p className="truncate text-xs text-text-muted">
                        {account.username ? `@${account.username}` : account.phoneNumber}
                      </p>
                    </div>
                  </div>
                  <span
                    className={cn(
                      'inline-flex items-center gap-1.5 rounded-full px-2.5 py-1 text-[10px] font-semibold uppercase',
                      connected ? 'bg-success-muted text-success' : 'bg-warning-muted text-warning',
                    )}
                  >
                    {connected ? <CheckCircle2 className="h-3 w-3" /> : <AlertTriangle className="h-3 w-3" />}
                    {STATUS_LABELS[account.status]}
                  </span>
                </div>

                <div className="mt-4 grid grid-cols-2 gap-3 text-xs">
                  <div className="rounded-md bg-surface-raised p-3">
                    <p className="text-text-muted">Usage today</p>
                    <p className="mt-1 font-semibold">{account.sentToday} / {account.dailyLimit}</p>
                  </div>
                  <div className="rounded-md bg-surface-raised p-3">
                    <p className="text-text-muted">Last checked</p>
                    <p className="mt-1 font-semibold">
                      {account.lastConnectedAt ? formatRelativeTime(account.lastConnectedAt) : 'Never'}
                    </p>
                  </div>
                </div>

                {account.lastError && (
                  <p className="mt-3 rounded-md border border-danger/20 bg-danger-muted px-3 py-2 text-xs text-danger">
                    {account.lastError}
                  </p>
                )}

                <div className="mt-4 flex gap-2">
                  <Button
                    variant="secondary"
                    size="sm"
                    pending={checkMutation.isPending}
                    onClick={() => checkMutation.mutate(account.id)}
                    leftIcon={<RefreshCw className="h-3.5 w-3.5" />}
                  >
                    Check session
                  </Button>
                  <Button
                    variant="ghost"
                    size="sm"
                    className="hover:bg-danger-muted hover:text-danger"
                    onClick={() => setConfirmDelete(account)}
                    leftIcon={<Trash2 className="h-3.5 w-3.5" />}
                  >
                    Remove
                  </Button>
                </div>
              </div>
            )
          })}
        </div>
      )}

      <div className="grid grid-cols-1 gap-5 xl:grid-cols-2">
        <section className="rounded-lg border border-border bg-surface p-5 shadow-sm">
          <h2 className="text-sm font-semibold">
            {pendingAccount ? 'Finish Telegram connection' : 'Connect a Telegram account'}
          </h2>
          <p className="mt-1 text-xs leading-5 text-text-secondary">
            Telegram sends a login code to the official app or by SMS. Two-step verification is
            requested separately when enabled.
          </p>

          {!pendingAccount && (
            <div className="mt-5 grid gap-4">
              <Input
                label="Connection name"
                value={form.name}
                onChange={(event) => setForm({ ...form, name: event.target.value })}
              />
              <div className="grid gap-4 sm:grid-cols-2">
                <Input
                  label="App API ID"
                  inputMode="numeric"
                  value={form.apiId}
                  onChange={(event) => setForm({ ...form, apiId: event.target.value })}
                />
                <Input
                  label="App API hash"
                  type="password"
                  autoComplete="off"
                  value={form.apiHash}
                  onChange={(event) => setForm({ ...form, apiHash: event.target.value })}
                />
              </div>
              <Input
                label="Telegram phone number"
                placeholder="+91 98765 43210"
                autoComplete="tel"
                value={form.phoneNumber}
                onChange={(event) => setForm({ ...form, phoneNumber: event.target.value })}
                description="Include the country code for the Telegram account you want to connect."
              />
              <Button
                pending={connectMutation.isPending}
                pendingLabel="Requesting code…"
                onClick={() => connectMutation.mutate()}
              >
                Send login code
              </Button>
            </div>
          )}

          {pendingAccount?.status === 'code_required' && (
            <div className="mt-5 grid gap-4">
              <p className="rounded-md bg-surface-raised px-3 py-2 text-xs text-text-secondary">
                Code sent via {delivery === 'sms' ? 'SMS' : 'the Telegram app'} to {pendingAccount.phoneNumber}.
              </p>
              <Input
                label="Verification code"
                inputMode="numeric"
                autoComplete="one-time-code"
                value={verificationCode}
                onChange={(event) => setVerificationCode(event.target.value)}
              />
              <div className="flex gap-2">
                <Button
                  pending={codeMutation.isPending}
                  pendingLabel="Verifying…"
                  onClick={() => codeMutation.mutate()}
                >
                  Verify code
                </Button>
                <Button variant="secondary" onClick={() => connectMutation.mutate()}>
                  Send a new code
                </Button>
              </div>
            </div>
          )}

          {pendingAccount?.status === 'password_required' && (
            <div className="mt-5 grid gap-4">
              <Input
                label="Two-step verification password"
                type="password"
                autoComplete="current-password"
                value={twoFactorPassword}
                onChange={(event) => setTwoFactorPassword(event.target.value)}
              />
              <Button
                pending={passwordMutation.isPending}
                pendingLabel="Connecting…"
                onClick={() => passwordMutation.mutate()}
              >
                Complete connection
              </Button>
            </div>
          )}
        </section>

        <section className="rounded-lg border border-border bg-surface p-5 shadow-sm">
          <h2 className="text-sm font-semibold">Send a test message</h2>
          <p className="mt-1 text-xs leading-5 text-text-secondary">
            Use an @username, phone number already known to the account, or a numeric Telegram peer ID.
          </p>
          <div className="mt-5 grid gap-4">
            <label className="grid gap-1.5 text-xs font-medium">
              Sending account
              <select
                className="h-10 rounded-md border border-border bg-surface-raised px-3 text-sm outline-none focus:border-accent/60 focus:ring-2 focus:ring-accent/20"
                value={testMessage.accountId}
                onChange={(event) => setTestMessage({ ...testMessage, accountId: event.target.value })}
              >
                <option value="">Choose an account</option>
                {connectedAccounts.map((account) => (
                  <option key={account.id} value={account.id}>{account.displayName || account.name}</option>
                ))}
              </select>
            </label>
            <Input
              label="Recipient"
              placeholder="@username"
              value={testMessage.peer}
              onChange={(event) => setTestMessage({ ...testMessage, peer: event.target.value })}
            />
            <label className="grid gap-1.5 text-xs font-medium">
              Message
              <textarea
                className="min-h-28 resize-y rounded-md border border-border bg-surface-raised px-3.5 py-2.5 text-sm outline-none placeholder:text-text-muted focus:border-accent/60 focus:ring-2 focus:ring-accent/20"
                maxLength={4096}
                placeholder="Write a short one-to-one message"
                value={testMessage.message}
                onChange={(event) => setTestMessage({ ...testMessage, message: event.target.value })}
              />
            </label>
            {sendResult && <p className="text-xs text-success">{sendResult}</p>}
            <Button
              disabled={!testMessage.accountId || !testMessage.peer || !testMessage.message}
              pending={sendMutation.isPending}
              pendingLabel="Sending…"
              onClick={() => sendMutation.mutate()}
              leftIcon={<Send className="h-3.5 w-3.5" />}
            >
              Send test message
            </Button>
          </div>
        </section>
      </div>

      <ConfirmDialog
        open={Boolean(confirmDelete)}
        onOpenChange={(open) => { if (!open) setConfirmDelete(null) }}
        title="Remove Telegram account?"
        description={confirmDelete ? `${confirmDelete.displayName || confirmDelete.name} will be logged out and removed.` : ''}
        confirmLabel="Remove account"
        destructive
        onConfirm={() => { if (confirmDelete) deleteMutation.mutate(confirmDelete.id) }}
      />
    </div>
  )
}
