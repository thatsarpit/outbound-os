import { useState } from 'react'
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { api } from '@/api/client'
import { Button, Input, ConfirmDialog } from '@/components/ui'
import { cn } from '@/lib/utils'
import { formatDate } from '@/lib/format-date'
import { Loader2, MessageSquare, Plus, Power, PowerOff, Trash2, X, RefreshCw } from 'lucide-react'
import { InfoTile, InfoMini } from '@/components/integrations/integration-helpers'

interface WhatsAppAccount {
  id: number
  name: string
  phone: string
  enabled: boolean
  status: string
  messagesSentToday: number
  hourlyLimit: number
  dailyLimit: number
  createdAt: string
}

export default function WhatsAppSection() {
  const queryClient = useQueryClient()
  const timezoneOffset = typeof window === 'undefined' ? 0 : new Date().getTimezoneOffset()
  const [showAdd, setShowAdd] = useState(false)
  const [confirmDelete, setConfirmDelete] = useState<WhatsAppAccount | null>(null)

  const { data: rawAccounts, isLoading } = useQuery({
    queryKey: ['wa-accounts'],
    queryFn: async () => {
      const res = await api.get<WhatsAppAccount[]>(`/whatsapp/accounts?tzOffset=${timezoneOffset}`)
      if (!res) throw new Error('Empty response')
      return res
    },
    refetchInterval: 10_000,
  })

  const accounts = Array.isArray(rawAccounts) ? rawAccounts : []
  const connectedAccounts = accounts.filter(
    (acc) => acc.enabled && acc.status === 'connected',
  ).length
  const totalToday = accounts.reduce((sum, acc) => sum + (acc.messagesSentToday || 0), 0)

  const enableMutation = useMutation({
    mutationFn: (id: number) => api.post(`/whatsapp/accounts/${id}/enable`),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ['wa-accounts'] }),
  })

  const disableMutation = useMutation({
    mutationFn: (id: number) => api.post(`/whatsapp/accounts/${id}/disable`),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ['wa-accounts'] }),
  })

  const deleteMutation = useMutation({
    mutationFn: (id: number) => api.delete(`/whatsapp/accounts/${id}`),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ['wa-accounts'] }),
  })

  const resetMutation = useMutation({
    mutationFn: () => api.post('/whatsapp/reset-counters'),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ['wa-accounts'] }),
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
      <div className="grid gap-3 sm:grid-cols-3">
        <InfoTile
          label="Connected"
          value={`${connectedAccounts}`}
          detail="Accounts live and enabled"
        />
        <InfoTile
          label="Messages Today"
          value={`${totalToday}`}
          detail="Outbound volume across all senders"
        />
        <InfoTile
          label="Accounts"
          value={`${accounts.length}`}
          detail="Configured WhatsApp profiles"
        />
      </div>

      <div className="flex flex-col gap-3 rounded-lg border border-border bg-surface px-5 py-5 shadow-sm md:flex-row md:items-center md:justify-between">
        <div>
          <p className="text-sm font-semibold">WhatsApp delivery surface</p>
          <p className="mt-1 text-sm text-text-secondary">
            Keep sender state, delivery capacity, and account health visible at a glance.
          </p>
        </div>
        <div className="flex gap-2">
          <Button
            variant="secondary"
            size="sm"
            onClick={() => resetMutation.mutate()}
            leftIcon={<RefreshCw className="w-3.5 h-3.5" />}
          >
            Reset Counters
          </Button>
          <Button
            size="sm"
            onClick={() => setShowAdd(true)}
            leftIcon={<Plus className="w-3.5 h-3.5" />}
          >
            Add Account
          </Button>
        </div>
      </div>

      {/* Account Cards */}
      <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-4">
        {accounts.map((acc) => (
          <div key={acc.id} className="card-hover glass overflow-hidden rounded-lg">
            <div className="border-b border-border bg-surface/70 p-5">
              <div className="flex items-center justify-between gap-3">
                <div className="flex items-center gap-2.5">
                  <div className="flex h-9 w-9 items-center justify-center rounded-md bg-accent-muted">
                    <MessageSquare className="w-4 h-4 text-accent" />
                  </div>
                  <div>
                    <p className="text-sm font-semibold">{acc.name || `Account ${acc.id}`}</p>
                    <p className="text-text-muted text-xs">{acc.phone || 'Not connected yet'}</p>
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
            </div>

            <div className="p-5">
              <div className="grid grid-cols-2 gap-2 mb-3 text-center">
                <InfoMini label="Today" value={acc.messagesSentToday} />
                <InfoMini label="Daily Limit" value={acc.dailyLimit} />
              </div>
              <div className="grid grid-cols-2 gap-2 mb-3 text-center">
                <InfoMini label="Hourly" value={acc.hourlyLimit} />
                <InfoMini label="Created" value={formatDate(acc.createdAt, 'medium')} compact />
              </div>

              <div className="flex gap-1 pt-3 border-t border-border-subtle">
                {acc.enabled ? (
                  <Button
                    variant="ghost"
                    size="sm"
                    onClick={() => disableMutation.mutate(acc.id)}
                    aria-label="Disable"
                  >
                    <PowerOff className="w-3.5 h-3.5" />
                  </Button>
                ) : (
                  <Button
                    variant="ghost"
                    size="sm"
                    onClick={() => enableMutation.mutate(acc.id)}
                    aria-label="Enable"
                  >
                    <Power className="w-3.5 h-3.5" />
                  </Button>
                )}
                <Button
                  variant="ghost"
                  size="sm"
                  className="hover:bg-danger-muted hover:text-danger"
                  onClick={() => setConfirmDelete(acc)}
                  aria-label="Delete"
                >
                  <Trash2 className="w-3.5 h-3.5" />
                </Button>
              </div>
            </div>
          </div>
        ))}
      </div>

      {accounts.length === 0 && (
        <div className="rounded-md border border-dashed border-border bg-surface px-6 py-12 text-center">
          <MessageSquare className="mx-auto mb-2 h-10 w-10 text-text-muted/40 animate-pulse" />
          <p className="text-text-secondary text-sm">No WhatsApp accounts connected</p>
          <p className="mt-1 text-xs text-text-muted">
            Add at least one sender before configuring per-account controls.
          </p>
        </div>
      )}

      {/* Add Account Modal */}
      {showAdd && <AddWhatsAppModal onClose={() => setShowAdd(false)} />}

      <ConfirmDialog
        open={!!confirmDelete}
        onOpenChange={(open) => {
          if (!open) setConfirmDelete(null)
        }}
        title="Delete WhatsApp account?"
        description={
          confirmDelete
            ? `${confirmDelete.name || confirmDelete.phone || `Account ${confirmDelete.id}`} will be permanently removed.`
            : ''
        }
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

function AddWhatsAppModal({ onClose }: { onClose: () => void }) {
  const queryClient = useQueryClient()
  const [form, setForm] = useState({ name: '' })

  const mutation = useMutation({
    mutationFn: () => api.post('/whatsapp/accounts', form),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['wa-accounts'] })
      onClose()
    },
  })

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
                WhatsApp integration
              </p>
              <h2 className="mt-2 text-lg font-semibold tracking-tight">Add WhatsApp Account</h2>
              <p className="mt-1 text-sm text-text-secondary">
                Create a sender profile before wiring its delivery settings.
              </p>
            </div>
            <Button variant="ghost" size="sm" onClick={onClose} aria-label="Close">
              <X className="w-4 h-4" />
            </Button>
          </div>
        </div>
        <div className="p-6 space-y-3">
          <Input
            label="Name"
            value={form.name}
            onChange={(e) => setForm({ ...form, name: e.target.value })}
            placeholder="Account name"
            required
          />
        </div>
        <div className="border-t border-border bg-surface/70 px-6 py-4 flex justify-end gap-2">
          <Button variant="ghost" onClick={onClose}>
            Cancel
          </Button>
          <Button
            onClick={() => mutation.mutate()}
            disabled={!form.name}
            isLoading={mutation.isPending}
          >
            Add
          </Button>
        </div>
      </div>
    </div>
  )
}
