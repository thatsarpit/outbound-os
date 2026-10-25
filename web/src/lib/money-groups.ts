import { formatMoney } from '@/api/endpoints/sales'

/** Never combine unlike currencies or label a historical sum with a mutable default. */
export function formatCurrencyTotals(groups?: Array<{ currency: string; total: number }>) {
  if (!groups) return '—'
  if (groups.length === 0) return 'No orders'
  return groups
    .map(({ currency, total }) => `${currency} ${formatMoney(total, currency)}`)
    .join(' · ')
}
