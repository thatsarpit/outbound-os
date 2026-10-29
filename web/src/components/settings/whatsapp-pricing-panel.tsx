import { useQuery } from '@tanstack/react-query'
import { Receipt } from 'lucide-react'
import { api } from '@/api/client'
import { SettingsPanel } from '@/components/settings/settings-panel'
import { MiniStat } from '@/components/settings/settings-stats'

/**
 * What this month's WhatsApp messages will cost, as far as Meta tells us.
 *
 * Meta's status webhooks say how each message is billed (category, and
 * whether it is billable) but not the amount, so this counts messages per
 * category; the rate card turns that into money. Use Meta's billable flag
 * and pricing type rather than assuming every delivered message is charged.
 */

type PricingSummary = {
  since: string
  timeZone: string
  categories: { category: string; billable: number; free: number }[]
  billable: number
  free: number
  unpriced: number
}

const CATEGORY_LABEL: Record<string, string> = {
  marketing: 'Marketing',
  marketing_lite: 'Marketing (lite)',
  utility: 'Utility',
  authentication: 'Authentication',
  authentication_international: 'Authentication (intl.)',
  service: 'Service replies',
}

const monthName = (iso: string, timeZone: string) =>
  new Date(iso).toLocaleDateString(undefined, { month: 'long', year: 'numeric', timeZone })

export function WhatsAppPricingPanel() {
  const { data, isLoading, isError } = useQuery({
    queryKey: ['analytics', 'whatsapp-pricing'],
    queryFn: () => api.get<PricingSummary>('/analytics/whatsapp-pricing'),
    staleTime: 60_000,
  })

  return (
    <SettingsPanel
      icon={Receipt}
      title="WhatsApp messaging costs"
      description="Message counts come from your provider's delivery updates. Check Meta or YCloud billing for actual charges, rates and any provider fees."
      action={
        <a
          href="https://developers.facebook.com/docs/whatsapp/pricing"
          target="_blank"
          rel="noreferrer"
          className="whitespace-nowrap text-sm font-medium text-accent hover:underline"
        >
          Meta rate card
        </a>
      }
    >
      <div className="mb-4 rounded-md border border-warning/30 bg-warning-muted px-4 py-3 text-sm text-text-primary">
        <p className="font-medium">WhatsApp charges depend on the message and its destination.</p>
        <p className="mt-1 text-text-secondary">
          A customer-service window permits session replies; it does not guarantee that your
          provider charges nothing. These counts use confirmed pricing information when available.
          Check your provider&rsquo;s billing portal before launching a campaign.
        </p>
      </div>

      {isLoading ? (
        <p className="text-sm text-text-muted">Loading this month&rsquo;s messages…</p>
      ) : isError || !data ? (
        <p className="text-sm text-text-muted">Could not load message costs.</p>
      ) : (
        <>
          <div className="grid gap-3 sm:grid-cols-3">
            <MiniStat
              label={`Billable in ${monthName(data.since, data.timeZone)}`}
              value={data.billable.toLocaleString()}
            />
            <MiniStat label="Free" value={data.free.toLocaleString()} />
            <MiniStat label="No pricing reported" value={data.unpriced.toLocaleString()} />
          </div>

          {data.categories.length > 0 ? (
            <table className="mt-4 w-full text-sm">
              <thead>
                <tr className="border-b border-border text-left text-xs uppercase tracking-[0.14em] text-text-muted">
                  <th className="py-2 font-medium">Category</th>
                  <th className="py-2 text-right font-medium">Billable</th>
                  <th className="py-2 text-right font-medium">Free</th>
                </tr>
              </thead>
              <tbody>
                {data.categories.map((row) => (
                  <tr key={row.category} className="border-b border-border/60">
                    <td className="py-2">{CATEGORY_LABEL[row.category] ?? row.category}</td>
                    <td className="py-2 text-right tabular-nums">
                      {row.billable.toLocaleString()}
                    </td>
                    <td className="py-2 text-right tabular-nums text-text-muted">
                      {row.free.toLocaleString()}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          ) : (
            <p className="mt-4 text-sm text-text-muted">
              No priced messages yet this month. Pricing appears when the provider reports it.
            </p>
          )}
          {data.unpriced > 0 && (
            <p className="mt-3 text-xs text-text-muted">
              &ldquo;No pricing reported&rdquo; covers messages without final pricing information.
              It does not mean those messages were free.
            </p>
          )}
        </>
      )}
    </SettingsPanel>
  )
}
