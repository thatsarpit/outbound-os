import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { BellOff, Mail, MessageCircle, RotateCw } from 'lucide-react'
import { crmApi, type OrderNotification } from '@/api/endpoints/crm'
import { SectionCard } from '@/components/ui/section-card'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { EmptyState } from '@/components/ui/empty-state'
import { toast } from '@/stores/toast-store'
import { formatDate } from '@/lib/format-date'

/**
 * What the customer was actually told about this order, on which channel, and
 * whether it arrived.
 *
 * Sends are fire-and-forget on the server, so without this panel a failed
 * notification is invisible: the order looks shipped and nobody knows the
 * customer was never informed.
 */

const STATUS_VARIANT = {
  sent: 'success',
  failed: 'danger',
  pending: 'warning',
  skipped: 'neutral',
} as const

const EVENT_LABEL: Record<string, string> = {
  order_confirmed: 'Order confirmed',
  order_shipped: 'Order shipped',
  order_delivered: 'Order delivered',
}

function ChannelIcon({ channel }: { channel: OrderNotification['channel'] }) {
  const Icon = channel === 'email' ? Mail : MessageCircle
  return <Icon className="h-3.5 w-3.5 shrink-0 text-text-muted" aria-hidden />
}

export function NotificationLog({ orderId }: { orderId: number }) {
  const queryClient = useQueryClient()
  const { data, isLoading } = useQuery({
    queryKey: ['order-notifications', orderId],
    queryFn: () => crmApi.orderNotifications(orderId),
  })
  const rows: OrderNotification[] = data?.data ?? []

  const resend = useMutation({
    // force, because the row already exists and the server skips a send that
    // is recorded as already delivered.
    mutationFn: (event: string) => crmApi.notifyOrder(orderId, event, { force: true }),
    onSuccess: () => {
      toast.success('Notification re-sent')
      queryClient.invalidateQueries({ queryKey: ['order-notifications', orderId] })
    },
    onError: (e: Error) => toast.error(e.message),
  })

  const failed = rows.filter((r: OrderNotification) => r.status === 'failed')

  return (
    <SectionCard
      title="Customer notifications"
      action={failed.length > 0 ? <Badge variant="danger">{failed.length} failed</Badge> : null}
    >
      {isLoading ? (
        <p className="text-[12px] text-text-muted">Loading…</p>
      ) : rows.length === 0 ? (
        <EmptyState
          icon={BellOff}
          compact
          title="Nothing sent yet"
          description="Confirming the order, adding a tracking number, or marking it delivered notifies the customer automatically."
        />
      ) : (
        <ul className="space-y-2">
          {rows.map((n: OrderNotification) => (
            <li key={n.id} className="rounded-lg border border-border bg-surface-raised px-3 py-2">
              <div className="flex items-start justify-between gap-2">
                <div className="flex min-w-0 items-start gap-2">
                  <span className="mt-0.5">
                    <ChannelIcon channel={n.channel} />
                  </span>
                  <div className="min-w-0">
                    <div className="text-[13px] font-medium">{EVENT_LABEL[n.event] ?? n.event}</div>
                    <div className="truncate text-[11px] text-text-muted">
                      {n.recipient || 'no recipient'}
                      {n.sentAt ? ` · ${formatDate(n.sentAt)}` : ''}
                    </div>
                    {n.error && <div className="mt-1 text-[11px] text-danger">{n.error}</div>}
                  </div>
                </div>
                <div className="flex shrink-0 items-center gap-1.5">
                  <Badge variant={STATUS_VARIANT[n.status] ?? 'neutral'}>{n.status}</Badge>
                  {n.status === 'failed' && (
                    <Button
                      size="sm"
                      variant="ghost"
                      pending={resend.isPending}
                      onClick={() => resend.mutate(n.event)}
                      leftIcon={<RotateCw className="h-3 w-3" />}
                      aria-label={`Retry ${n.event} notification`}
                    >
                      Retry
                    </Button>
                  )}
                </div>
              </div>
            </li>
          ))}
        </ul>
      )}
      {failed.length > 0 && (
        <p className="mt-3 text-[11px] text-text-muted">
          Failed sends retry automatically every 30 minutes for 48 hours. Retry here to try again
          immediately.
        </p>
      )}
    </SectionCard>
  )
}
