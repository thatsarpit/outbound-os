import { formatMoney } from '@/api/endpoints/sales'

export function CurrencyTotals({
  totals,
}: {
  totals?: Array<{ currency: string; total: number }>
}) {
  if (!totals?.length) return <p className="text-sm text-text-muted">No order values recorded.</p>
  return (
    <dl className="flex flex-wrap gap-x-8 gap-y-3">
      {totals.map((row) => (
        <div key={row.currency}>
          <dt className="text-xs text-text-muted">{row.currency}</dt>
          <dd className="mt-1 text-base font-semibold tabular-nums">
            {formatMoney(row.total, row.currency)}
          </dd>
        </div>
      ))}
    </dl>
  )
}
