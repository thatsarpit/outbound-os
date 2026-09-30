import { useHomeCurrency } from '@/hooks/use-home-currency'
import { formatCount, formatCurrency, formatNumber } from '@/lib/utils'

/** Shared chart number formatting. Percent inputs are percentage points (0–100). */
export function useChartFormatters() {
  const currencyCode = useHomeCurrency()
  return {
    count: formatNumber,
    exactCount: formatCount,
    percent: (value: number, digits = 1) => `${value.toFixed(digits)}%`,
    currency: (value: number) => formatCurrency(value, currencyCode),
  }
}
