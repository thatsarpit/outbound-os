import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { useState } from 'react'
import { TrendingUp, AlertTriangle } from 'lucide-react'
import {
  salesApi,
  formatMoney,
  formatInr,
  bpsToPercent,
  fxToDisplay,
  displayToFx,
  type SalesOrder,
} from '@/api/endpoints/sales'
import { SectionCard } from '@/components/ui/section-card'
import { Badge } from '@/components/ui/badge'
import { toast } from '@/stores/toast-store'
import { cn } from '@/lib/utils'

/**
 * What the order is actually worth.
 *
 * The chain reads top to bottom because that is the order the money moves in:
 * goods → payment fee → what we receive → converted to rupees → less what the
 * supplier charges → profit. Showing only the final number would hide where a
 * thin margin came from.
 */

const inputClass =
  'h-8 w-full rounded-md border border-border bg-surface px-2 text-[13px] text-text-primary placeholder:text-text-muted focus:border-focus focus:outline-none focus:ring-3 focus:ring-focus-muted'

function Row({
  label,
  value,
  hint,
  strong,
  muted,
}: {
  label: string
  value: string
  hint?: string
  strong?: boolean
  muted?: boolean
}) {
  return (
    <div className="flex items-baseline justify-between gap-3 py-1.5">
      <span className={cn('text-[13px]', muted ? 'text-text-muted' : 'text-text-secondary')}>
        {label}
        {hint && <span className="ml-1.5 text-[11px] text-text-muted">{hint}</span>}
      </span>
      <span
        className={cn(
          'shrink-0 tabular-nums',
          strong ? 'text-[15px] font-semibold text-text-primary' : 'text-[13px] text-text-primary',
        )}
      >
        {value}
      </span>
    </div>
  )
}

export function SettlementPanel({ order }: { order: SalesOrder }) {
  const queryClient = useQueryClient()
  const [fx, setFx] = useState(fxToDisplay(order.fxRateToInr))
  const [received, setReceived] = useState(
    order.amountReceivedInr !== null ? String(order.amountReceivedInr / 100) : '',
  )

  const { data: settlement } = useQuery({
    queryKey: ['settlement', order.id, order.updatedAt],
    queryFn: () => salesApi.getSettlement(order.id),
  })
  const { data: methods } = useQuery({
    queryKey: ['payment-methods'],
    queryFn: () => salesApi.listPaymentMethods(),
    staleTime: 300_000,
  })
  const { data: suppliers } = useQuery({
    queryKey: ['suppliers'],
    queryFn: () => salesApi.listSuppliers(),
    staleTime: 300_000,
  })

  const save = useMutation({
    mutationFn: (patch: Partial<SalesOrder>) => salesApi.updateOrder(order.id, patch),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['order', order.id] })
      queryClient.invalidateQueries({ queryKey: ['settlement', order.id] })
      queryClient.invalidateQueries({ queryKey: ['orders'] })
      toast.success('Settlement updated')
    },
    onError: (e: Error) => toast.error(e.message),
  })

  const cur = order.currency
  const profit = settlement?.profitInr ?? null
  const margin = settlement?.marginPct ?? null

  return (
    <SectionCard
      title="Settlement"
      description="What lands in rupees after fees, and what is left after the supplier."
    >
      <div className="grid gap-3 sm:grid-cols-2">
        <label className="block">
          <span className="text-[12px] font-medium text-text-secondary">Supplier</span>
          <select
            className={cn(inputClass, 'mt-1')}
            value={order.supplierId ?? ''}
            onChange={(e) =>
              save.mutate({ supplierId: e.target.value ? Number(e.target.value) : null })
            }
          >
            <option value="">Not set</option>
            {(suppliers?.data ?? [])
              .filter((s) => s.enabled || s.id === order.supplierId)
              .map((s) => (
                <option key={s.id} value={s.id}>
                  {s.name}
                </option>
              ))}
          </select>
        </label>

        <label className="block">
          <span className="text-[12px] font-medium text-text-secondary">Payment method</span>
          <select
            className={cn(inputClass, 'mt-1')}
            value={order.paymentMethodId ?? ''}
            onChange={(e) => {
              const id = e.target.value ? Number(e.target.value) : null
              const m = (methods?.data ?? []).find((x) => x.id === id)
              // Adopt the method's default handling; the user can then flip it.
              save.mutate({
                paymentMethodId: id,
                feeMode: m?.passOnByDefault ? 'pass_on' : 'absorb',
              })
            }}
          >
            <option value="">Not set</option>
            {(methods?.data ?? [])
              .filter((m) => m.enabled || m.id === order.paymentMethodId)
              .map((m) => (
                <option key={m.id} value={m.id}>
                  {m.name}
                  {m.feeBps > 0 ? ` — ${bpsToPercent(m.feeBps)}` : ' — no fee'}
                </option>
              ))}
          </select>
        </label>

        <label className="block">
          <span className="text-[12px] font-medium text-text-secondary">Who pays the fee</span>
          <select
            className={cn(inputClass, 'mt-1')}
            value={order.feeMode}
            onChange={(e) => save.mutate({ feeMode: e.target.value as 'absorb' | 'pass_on' })}
          >
            <option value="absorb">We absorb it</option>
            <option value="pass_on">Client pays it</option>
          </select>
        </label>

        <label className="block">
          <span className="text-[12px] font-medium text-text-secondary">Rate {cur} → INR</span>
          <input
            className={cn(inputClass, 'mt-1')}
            inputMode="decimal"
            placeholder="83.5000"
            value={fx}
            onChange={(e) => setFx(e.target.value)}
            onBlur={() => {
              const next = displayToFx(fx)
              if (next !== (order.fxRateToInr ?? 0)) save.mutate({ fxRateToInr: next || null })
            }}
          />
        </label>
      </div>

      <div className="mt-4 border-t border-border pt-2">
        <Row label="Goods" value={formatMoney(settlement?.goodsTotal ?? 0, cur)} />
        {settlement && settlement.fee > 0 ? (
          <Row
            label={order.feeMode === 'pass_on' ? 'Fee added to invoice' : 'Payment fee'}
            hint={settlement.paymentMethod?.name}
            value={`${order.feeMode === 'pass_on' ? '+' : '−'}${formatMoney(settlement.fee, cur)}`}
            muted
          />
        ) : null}
        <Row label="Client is invoiced" value={formatMoney(settlement?.invoiceTotal ?? 0, cur)} />
        <Row label="We receive" value={formatMoney(settlement?.netReceivable ?? 0, cur)} />

        <div className="my-2 border-t border-border-subtle" />

        <Row
          label="Lands in rupees"
          hint={
            settlement?.usingActual
              ? 'from bank statement'
              : order.fxRateToInr
                ? 'at the rate above'
                : 'set a rate'
          }
          value={formatInr(settlement?.landedInr)}
        />
        <Row
          label="Supplier cost"
          hint={settlement?.supplier?.name}
          value={settlement ? `−${formatInr(settlement.procurementCostInr)}` : '—'}
          muted
        />

        <div className="my-2 border-t border-border" />

        <div className="flex items-baseline justify-between gap-3 py-1">
          <span className="flex items-center gap-1.5 text-[13px] font-medium text-text-primary">
            <TrendingUp aria-hidden="true" className="h-3.5 w-3.5" />
            Profit
          </span>
          <span className="flex items-baseline gap-2">
            <span
              className={cn(
                'text-lg font-semibold tabular-nums',
                profit === null ? 'text-text-muted' : profit >= 0 ? 'text-success' : 'text-danger',
              )}
            >
              {formatInr(profit)}
            </span>
            {margin !== null && (
              <Badge variant={margin >= 0 ? 'success' : 'danger'}>{margin.toFixed(1)}%</Badge>
            )}
          </span>
        </div>

        {profit === null && (
          <p className="mt-1 flex items-start gap-1.5 text-[11px] text-text-muted">
            <AlertTriangle aria-hidden="true" className="mt-0.5 h-3 w-3 shrink-0" />
            Set an exchange rate, or record what actually reached the bank, to see the profit.
          </p>
        )}
      </div>

      <label className="mt-3 block border-t border-border pt-3">
        <span className="text-[12px] font-medium text-text-secondary">Actually received (₹)</span>
        <input
          className={cn(inputClass, 'mt-1')}
          inputMode="decimal"
          placeholder="Leave blank to use the converted figure"
          value={received}
          onChange={(e) => setReceived(e.target.value)}
          onBlur={() => {
            const next = received.trim() === '' ? null : Math.round(Number(received) * 100)
            if (next !== order.amountReceivedInr) save.mutate({ amountReceivedInr: next })
          }}
        />
        <span className="mt-1 block text-[11px] text-text-muted">
          Correspondent bank charges mean the converted figure and the real credit rarely match.
          What you enter here wins.
        </span>
      </label>
    </SectionCard>
  )
}
