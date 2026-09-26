import { useState } from 'react'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { webhooksApi } from '@/api/endpoints/webhooks'
import type { WebhookSubscription } from '@/api/types'
import { toast } from '@/stores/toast-store'
import { cn, formatRelativeTime } from '@/lib/utils'
import { ConfirmDialog } from '@/components/ui/confirm-dialog'
import { EmptyState } from '@/components/ui/empty-state'
import { Loader2, Plus, Send, TestTube, Trash2, X } from 'lucide-react'

const EVENT_OPTIONS = [
  { value: 'lead.created', label: 'Lead created' },
  { value: 'lead.replied', label: 'Lead replied' },
  { value: 'lead.engaged', label: 'Lead engaged' },
  { value: 'lead.converted', label: 'Lead converted' },
  { value: 'message.sent', label: 'Message sent' },
  { value: 'campaign.started', label: 'Campaign started' },
  { value: 'campaign.completed', label: 'Campaign completed' },
]

function eventsList(events: string | null | undefined): string[] {
  if (!events) return []
  try {
    const parsed = JSON.parse(events)
    return Array.isArray(parsed) ? parsed.map(String) : []
  } catch {
    return events
      .split(',')
      .map((s) => s.trim())
      .filter(Boolean)
  }
}

export function OutboundSubscriptionsCard() {
  const queryClient = useQueryClient()
  const [showAdd, setShowAdd] = useState(false)
  const [deleteTarget, setDeleteTarget] = useState<WebhookSubscription | null>(null)

  const { data: subs, isLoading } = useQuery({
    queryKey: ['webhook-subscriptions'],
    queryFn: () => webhooksApi.listSubscriptions(),
  })

  const deleteMutation = useMutation({
    mutationFn: (id: number) => webhooksApi.deleteSubscription(id),
    onSuccess: () => {
      toast.success('Subscription deleted')
      queryClient.invalidateQueries({ queryKey: ['webhook-subscriptions'] })
    },
    onError: (e: Error) => toast.error(e.message || 'Delete failed'),
  })

  const testMutation = useMutation({
    mutationFn: (id: number) => webhooksApi.testSubscription(id),
    onSuccess: (res) => {
      if (res?.success) toast.success(`Test delivered${res.status ? ` • HTTP ${res.status}` : ''}`)
      else toast.error(`Test delivery failed${res?.status ? ` (HTTP ${res.status})` : ''}`)
    },
    onError: (e: Error) => toast.error(e.message || 'Test failed'),
  })

  const list = Array.isArray(subs) ? subs : []

  return (
    <div className="rounded-lg border border-border bg-surface p-5 shadow-sm">
      <div className="mb-4 flex flex-col gap-3 md:flex-row md:items-center md:justify-between">
        <div>
          <p className="text-sm font-semibold">Outbound subscriptions</p>
          <p className="mt-1 text-sm text-text-secondary">
            Push workspace events (lead.replied, campaign.completed, …) to any HTTPS endpoint.
          </p>
        </div>
        <button
          type="button"
          onClick={() => setShowAdd(true)}
          className="inline-flex items-center gap-1.5 rounded-md bg-accent px-4 py-2 text-xs font-semibold text-accent-fg transition-colors hover:bg-accent-hover"
        >
          <Plus className="h-3.5 w-3.5" /> Add subscription
        </button>
      </div>

      {isLoading ? (
        <div className="flex justify-center py-10">
          <Loader2 className="h-5 w-5 animate-spin text-accent" />
        </div>
      ) : list.length === 0 ? (
        <EmptyState
          compact
          icon={Send}
          title="No outbound webhooks yet"
          description="Subscribe to workspace events to integrate with Zapier, Make, or your own backend."
        />
      ) : (
        <div className="grid grid-cols-1 gap-3 md:grid-cols-2">
          {list.map((sub) => {
            const events = eventsList(sub.events)
            return (
              <div
                key={sub.id}
                className="card-hover rounded-md border border-border bg-surface-raised/50 p-4"
              >
                <div className="flex items-start justify-between gap-3">
                  <div className="min-w-0 flex-1">
                    <p className="truncate text-sm font-semibold text-text-primary">{sub.name}</p>
                    <p className="mt-1 truncate font-mono text-xs text-accent" title={sub.url}>
                      {sub.url}
                    </p>
                  </div>
                  <span
                    className={cn(
                      'rounded-full px-2 py-0.5 text-[10px] font-semibold uppercase',
                      sub.enabled
                        ? 'bg-success-muted text-success'
                        : 'bg-surface-overlay text-text-muted',
                    )}
                  >
                    {sub.enabled ? 'Active' : 'Paused'}
                  </span>
                </div>
                <div className="mt-3 flex flex-wrap gap-1.5">
                  {events.length === 0 ? (
                    <span className="text-[11px] text-text-muted">No events</span>
                  ) : (
                    events.map((ev) => (
                      <span
                        key={ev}
                        className="rounded-full bg-accent-muted px-2 py-0.5 text-[10px] font-medium text-accent"
                      >
                        {ev}
                      </span>
                    ))
                  )}
                </div>
                <div className="mt-3 flex items-center justify-between text-[11px] text-text-muted">
                  <span>
                    {sub.failCount > 0 ? (
                      <span className="text-danger">{sub.failCount} failed deliveries</span>
                    ) : (
                      <span>No failures</span>
                    )}
                  </span>
                  <span>
                    {sub.lastTriggeredAt
                      ? formatRelativeTime(sub.lastTriggeredAt)
                      : 'never triggered'}
                  </span>
                </div>
                <div className="mt-3 flex items-center gap-2">
                  <button
                    type="button"
                    onClick={() => testMutation.mutate(sub.id)}
                    disabled={testMutation.isPending}
                    className="inline-flex items-center gap-1 rounded-lg border border-border bg-surface px-2.5 py-1.5 text-[11px] font-medium text-text-secondary transition-colors hover:bg-surface-raised hover:text-text-primary"
                  >
                    <TestTube className="h-3 w-3" /> Test
                  </button>
                  <button
                    type="button"
                    onClick={() => setDeleteTarget(sub)}
                    className="inline-flex items-center gap-1 rounded-lg border border-border bg-surface px-2.5 py-1.5 text-[11px] font-medium text-text-secondary transition-colors hover:bg-danger-muted hover:text-danger"
                  >
                    <Trash2 className="h-3 w-3" /> Delete
                  </button>
                </div>
              </div>
            )
          })}
        </div>
      )}

      {showAdd && <AddSubscriptionDrawer onClose={() => setShowAdd(false)} />}

      <ConfirmDialog
        open={!!deleteTarget}
        title="Delete subscription?"
        body={
          deleteTarget
            ? `"${deleteTarget.name}" will stop receiving events. This cannot be undone.`
            : undefined
        }
        confirmLabel="Delete"
        tone="danger"
        busy={deleteMutation.isPending}
        onClose={() => setDeleteTarget(null)}
        onConfirm={async () => {
          if (!deleteTarget) return
          await deleteMutation.mutateAsync(deleteTarget.id)
          setDeleteTarget(null)
        }}
      />
    </div>
  )
}

function AddSubscriptionDrawer({ onClose }: { onClose: () => void }) {
  const queryClient = useQueryClient()
  const [name, setName] = useState('')
  const [url, setUrl] = useState('')
  const [events, setEvents] = useState<string[]>(['lead.replied'])
  const [secret, setSecret] = useState('')

  const createMutation = useMutation({
    mutationFn: () =>
      webhooksApi.createSubscription({
        name,
        url,
        events,
        secret: secret || undefined,
        enabled: true,
      }),
    onSuccess: () => {
      toast.success('Subscription created')
      queryClient.invalidateQueries({ queryKey: ['webhook-subscriptions'] })
      onClose()
    },
    onError: (e: Error) => toast.error(e.message || 'Could not create'),
  })

  return (
    <div className="fixed inset-0 z-[100] flex items-center justify-center p-4">
      <button
        type="button"
        aria-label="Close"
        onClick={onClose}
        className="absolute inset-0 bg-black/60 backdrop-blur-sm"
      />
      <div className="relative w-full max-w-lg rounded-md border border-border bg-surface shadow-2xl">
        <div className="flex items-center justify-between border-b border-border p-5">
          <h3 className="text-base font-semibold">New outbound webhook</h3>
          <button
            type="button"
            onClick={onClose}
            aria-label="Close"
            className="rounded-lg p-1.5 text-text-muted hover:bg-surface-raised"
          >
            <X className="h-4 w-4" />
          </button>
        </div>

        <form
          onSubmit={(e) => {
            e.preventDefault()
            if (!name.trim() || !url.trim() || events.length === 0) return
            createMutation.mutate()
          }}
          className="space-y-4 p-5"
        >
          <label className="block text-xs font-semibold text-text-secondary">
            Name
            <input
              required
              value={name}
              onChange={(e) => setName(e.target.value)}
              placeholder="Zapier — New replies"
              className="form-input mt-1.5"
            />
          </label>

          <label className="block text-xs font-semibold text-text-secondary">
            Endpoint URL
            <input
              required
              type="url"
              value={url}
              onChange={(e) => setUrl(e.target.value)}
              placeholder="https://hooks.zapier.com/hooks/catch/…"
              className="form-input mt-1.5 font-mono"
            />
          </label>

          <div>
            <p className="text-xs font-semibold text-text-secondary">Events</p>
            <div className="mt-2 flex flex-wrap gap-2">
              {EVENT_OPTIONS.map((opt) => {
                const checked = events.includes(opt.value)
                return (
                  <label
                    key={opt.value}
                    className={cn(
                      'cursor-pointer rounded-full border px-3 py-1.5 text-xs font-medium transition-colors',
                      checked
                        ? 'border-accent bg-accent-muted text-accent'
                        : 'border-border bg-surface-raised text-text-secondary hover:text-text-primary',
                    )}
                  >
                    <input
                      type="checkbox"
                      className="sr-only"
                      checked={checked}
                      onChange={(e) => {
                        setEvents((prev) =>
                          e.target.checked
                            ? [...prev, opt.value]
                            : prev.filter((v) => v !== opt.value),
                        )
                      }}
                    />
                    {opt.label}
                  </label>
                )
              })}
            </div>
          </div>

          <label className="block text-xs font-semibold text-text-secondary">
            Secret (optional)
            <input
              value={secret}
              onChange={(e) => setSecret(e.target.value)}
              placeholder="HMAC shared secret"
              className="form-input mt-1.5 font-mono"
            />
          </label>

          <div className="flex items-center justify-end gap-2 pt-2">
            <button
              type="button"
              onClick={onClose}
              className="rounded-md border border-border bg-surface px-4 py-2 text-sm text-text-secondary hover:bg-surface-raised"
            >
              Cancel
            </button>
            <button
              type="submit"
              disabled={
                createMutation.isPending || !name.trim() || !url.trim() || events.length === 0
              }
              className="inline-flex items-center gap-2 rounded-md bg-accent px-4 py-2 text-sm font-semibold text-accent-fg transition-colors hover:bg-accent-hover disabled:opacity-50"
            >
              {createMutation.isPending ? <Loader2 className="h-4 w-4 animate-spin" /> : null}
              Create subscription
            </button>
          </div>
        </form>
      </div>
    </div>
  )
}
