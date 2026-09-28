import { useHomeCurrency } from '@/hooks/use-home-currency'
import { useState } from 'react'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { Package2, Plus, Sparkles, Trash2, TrendingUp } from 'lucide-react'
import { productsApi, type Product } from '@/api/endpoints/products'
import { salesApi, formatMoney } from '@/api/endpoints/sales'
import { PageHeader } from '@/components/ui/page-header'
import { SectionCard } from '@/components/ui/section-card'
import { MetricCard } from '@/components/ui/metric-card'
import { BarList } from '@/components/ui/bar-list'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { EmptyState } from '@/components/ui/empty-state'
import { SkeletonTable } from '@/components/ui/skeleton'
import { useChartTheme } from '@/hooks/use-chart-theme'
import { toast } from '@/stores/toast-store'
import { cn } from '@/lib/utils'

/**
 * The catalogue.
 *
 * Prices here pre-fill an order line and nothing more — a line keeps whatever
 * was actually agreed. The suggestions panel exists because the catalogue
 * starts empty while thousands of leads already say what people ask for.
 */

const inputClass =
  'h-8 w-full rounded-md border border-border bg-surface px-2 text-[13px] text-text-primary placeholder:text-text-muted focus:border-focus focus:outline-none focus:ring-3 focus:ring-focus-muted'

/** Major units in the field, minor units on the wire. */
const toMinor = (v: string) => (v.trim() === '' ? null : Math.round(Number(v) * 100))
const toMajor = (v: number | null) => (v === null || v === undefined ? '' : String(v / 100))

export default function ProductsPage() {
  const chartTheme = useChartTheme()
  const queryClient = useQueryClient()
  const [search, setSearch] = useState('')
  const home = useHomeCurrency()
  const [draft, setDraft] = useState({ name: '', strength: '', unit: 'box', sell: '', cost: '' })

  const invalidate = () => {
    queryClient.invalidateQueries({ queryKey: ['products'] })
    queryClient.invalidateQueries({ queryKey: ['product-performance'] })
    queryClient.invalidateQueries({ queryKey: ['product-suggestions'] })
  }

  const { data, isLoading } = useQuery({
    queryKey: ['products', search],
    queryFn: () => productsApi.list({ search: search || undefined }),
  })
  const { data: perf } = useQuery({
    queryKey: ['product-performance'],
    queryFn: () => productsApi.performance(),
  })
  const { data: suggestions } = useQuery({
    queryKey: ['product-suggestions'],
    queryFn: () => productsApi.suggestions(),
    staleTime: 600_000,
  })
  const { data: suppliers } = useQuery({
    queryKey: ['suppliers'],
    queryFn: () => salesApi.listSuppliers(),
    staleTime: 300_000,
  })

  const save = useMutation({
    mutationFn: ({ id, patch }: { id: number; patch: Partial<Product> }) =>
      productsApi.update(id, patch),
    onSuccess: () => {
      invalidate()
      toast.success('Product updated')
    },
    onError: (e: Error) => toast.error(e.message),
  })

  const add = useMutation({
    mutationFn: (p: Partial<Product>) => productsApi.create(p),
    onSuccess: () => {
      setDraft({ name: '', strength: '', unit: 'box', sell: '', cost: '' })
      invalidate()
      toast.success('Product added')
    },
    onError: (e: Error) => toast.error(e.message),
  })

  const remove = useMutation({
    mutationFn: (id: number) => productsApi.remove(id),
    onSuccess: (res) => {
      invalidate()
      const r = res as { deactivated?: boolean; reason?: string } | undefined
      toast.success(r?.deactivated ? `Deactivated — ${r.reason}` : 'Product removed')
    },
    onError: (e: Error) => toast.error(e.message),
  })

  const products = data?.data ?? []
  const rows = perf?.data ?? []
  const revenueRamp = chartTheme.sequential(Math.max(rows.length, 1)).reverse()
  const catalogued = products.length
  const withCost = products.filter((p) => p.costInr !== null).length

  return (
    <div className="animate-fade-in space-y-6">
      <PageHeader
        title="Products"
        description="What you sell, with the prices that pre-fill an order line."
      />

      <div className="grid grid-cols-1 gap-3 sm:grid-cols-3">
        <MetricCard
          icon={Package2}
          label="Catalogued"
          value={catalogued}
          hint="Products you can pick on an order"
        />
        <MetricCard
          icon={TrendingUp}
          label="With a supplier cost"
          value={withCost}
          meter={catalogued > 0 ? withCost / catalogued : 0}
          hint="Needed for margin to pre-fill"
        />
        <MetricCard
          icon={Sparkles}
          label="Suggested from leads"
          value={suggestions?.data.length ?? 0}
          hint="Asked for, not catalogued yet"
        />
      </div>

      {rows.length > 0 && (
        <SectionCard
          title="What sells"
          description={
            perf && perf.unlinkedLines > 0
              ? `By revenue across confirmed orders. ${perf.unlinkedLines} line${perf.unlinkedLines === 1 ? '' : 's'} typed as free text are not counted.`
              : 'By revenue across confirmed orders.'
          }
        >
          <BarList
            items={rows.slice(0, 8).map((r, i) => ({
              label: `${r.product.name}${r.product.strength ? ` · ${r.product.strength}` : ''}`,
              value: r.revenue,
              display: `${formatMoney(r.revenue, r.product.sellCurrency)}  ·  ${r.quantity} ${r.product.defaultUnit}`,
              color: revenueRamp[i] ?? revenueRamp[0],
            }))}
          />
        </SectionCard>
      )}

      <SectionCard
        title="Catalogue"
        description="Prices pre-fill a line and can be overridden on any order."
      >
        <input
          className={cn(inputClass, 'mb-3 h-9 max-w-xs')}
          placeholder="Search name, strength, SKU…"
          value={search}
          onChange={(e) => setSearch(e.target.value)}
        />

        {isLoading ? (
          <SkeletonTable rows={5} />
        ) : products.length === 0 ? (
          <EmptyState
            icon={Package2}
            title="Nothing catalogued yet"
            description="Add what you sell here and order lines stop being free text — prices pre-fill, and the system can finally add up what sells."
          />
        ) : (
          <div className="overflow-x-auto rounded-lg border border-border">
            <table className="w-full text-sm" style={{ minWidth: 900 }}>
              <thead className="bg-surface-raised">
                <tr className="border-b border-border text-[11px] uppercase tracking-[0.06em] text-text-muted">
                  <th className="px-2 py-2 text-left font-medium">Product</th>
                  <th className="px-2 py-2 text-left font-medium">Strength</th>
                  <th className="px-2 py-2 text-left font-medium">Unit</th>
                  <th className="px-2 py-2 text-right font-medium">Sell</th>
                  <th className="px-2 py-2 text-right font-medium">Cost {home}</th>
                  <th className="px-2 py-2 text-left font-medium">Supplier</th>
                  <th className="px-2 py-2 text-left font-medium">Status</th>
                  <th className="px-2 py-2" />
                </tr>
              </thead>
              <tbody>
                {products.map((p) => (
                  <tr key={p.id} className="border-b border-border-subtle last:border-0">
                    <td className="px-2 py-2">
                      <input
                        className={inputClass}
                        defaultValue={p.name}
                        onBlur={(e) => {
                          if (e.target.value !== p.name)
                            save.mutate({ id: p.id, patch: { name: e.target.value } })
                        }}
                      />
                    </td>
                    <td className="px-2 py-2">
                      <input
                        className={cn(inputClass, 'w-24')}
                        defaultValue={p.strength ?? ''}
                        onBlur={(e) => {
                          if (e.target.value !== (p.strength ?? ''))
                            save.mutate({ id: p.id, patch: { strength: e.target.value } })
                        }}
                      />
                    </td>
                    <td className="px-2 py-2">
                      <input
                        className={cn(inputClass, 'w-20')}
                        defaultValue={p.defaultUnit}
                        onBlur={(e) => {
                          if (e.target.value !== p.defaultUnit)
                            save.mutate({ id: p.id, patch: { defaultUnit: e.target.value } })
                        }}
                      />
                    </td>
                    <td className="px-2 py-2">
                      <input
                        className={cn(inputClass, 'w-24 text-right')}
                        inputMode="decimal"
                        placeholder="—"
                        defaultValue={toMajor(p.sellPrice)}
                        onBlur={(e) => {
                          const v = toMinor(e.target.value)
                          if (v !== p.sellPrice) save.mutate({ id: p.id, patch: { sellPrice: v } })
                        }}
                      />
                    </td>
                    <td className="px-2 py-2">
                      <input
                        className={cn(inputClass, 'w-24 text-right')}
                        inputMode="decimal"
                        placeholder="—"
                        defaultValue={toMajor(p.costInr)}
                        onBlur={(e) => {
                          const v = toMinor(e.target.value)
                          if (v !== p.costInr) save.mutate({ id: p.id, patch: { costInr: v } })
                        }}
                      />
                    </td>
                    <td className="px-2 py-2">
                      <select
                        className={cn(inputClass, 'w-32')}
                        value={p.supplierId ?? ''}
                        onChange={(e) =>
                          save.mutate({
                            id: p.id,
                            patch: { supplierId: e.target.value ? Number(e.target.value) : null },
                          })
                        }
                      >
                        <option value="">—</option>
                        {(suppliers?.data ?? [])
                          .filter((s) => s.enabled)
                          .map((s) => (
                            <option key={s.id} value={s.id}>
                              {s.name}
                            </option>
                          ))}
                      </select>
                    </td>
                    <td className="px-2 py-2">
                      <button
                        type="button"
                        onClick={() => save.mutate({ id: p.id, patch: { active: !p.active } })}
                      >
                        <Badge variant={p.active ? 'success' : 'neutral'}>
                          {p.active ? 'Active' : 'Inactive'}
                        </Badge>
                      </button>
                    </td>
                    <td className="px-2 py-2 text-right">
                      <button
                        type="button"
                        aria-label={`Remove ${p.name}`}
                        onClick={() => remove.mutate(p.id)}
                        className="text-text-muted transition-colors hover:text-danger"
                      >
                        <Trash2 className="h-3.5 w-3.5" />
                      </button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}

        <div className="mt-3 flex flex-wrap items-end gap-2 border-t border-border pt-3">
          <label className="min-w-0 flex-1">
            <span className="text-[12px] font-medium text-text-secondary">Product</span>
            <input
              className={cn(inputClass, 'mt-1')}
              placeholder="e.g. Hex Bolt M8"
              value={draft.name}
              onChange={(e) => setDraft({ ...draft, name: e.target.value })}
            />
          </label>
          <label className="w-24">
            <span className="text-[12px] font-medium text-text-secondary">Strength</span>
            <input
              className={cn(inputClass, 'mt-1')}
              placeholder="e.g. 500 ml"
              value={draft.strength}
              onChange={(e) => setDraft({ ...draft, strength: e.target.value })}
            />
          </label>
          <label className="w-20">
            <span className="text-[12px] font-medium text-text-secondary">Unit</span>
            <input
              className={cn(inputClass, 'mt-1')}
              value={draft.unit}
              onChange={(e) => setDraft({ ...draft, unit: e.target.value })}
            />
          </label>
          <label className="w-24">
            <span className="text-[12px] font-medium text-text-secondary">Sell</span>
            <input
              className={cn(inputClass, 'mt-1 text-right')}
              inputMode="decimal"
              placeholder="12.00"
              value={draft.sell}
              onChange={(e) => setDraft({ ...draft, sell: e.target.value })}
            />
          </label>
          <label className="w-24">
            <span className="text-[12px] font-medium text-text-secondary">Cost {home}</span>
            <input
              className={cn(inputClass, 'mt-1 text-right')}
              inputMode="decimal"
              placeholder="480"
              value={draft.cost}
              onChange={(e) => setDraft({ ...draft, cost: e.target.value })}
            />
          </label>
          <Button
            size="sm"
            variant="secondary"
            leftIcon={<Plus className="h-3.5 w-3.5" />}
            disabled={!draft.name.trim()}
            pending={add.isPending}
            onClick={() =>
              add.mutate({
                name: draft.name.trim(),
                strength: draft.strength.trim() || null,
                defaultUnit: draft.unit.trim() || 'box',
                sellPrice: toMinor(draft.sell),
                costInr: toMinor(draft.cost),
              })
            }
          >
            Add
          </Button>
        </div>
      </SectionCard>

      {(suggestions?.data.length ?? 0) > 0 && (
        <SectionCard
          title="Asked for, but not catalogued"
          description="Taken from what your leads actually enquired about. Add the ones you sell."
        >
          <div className="flex flex-wrap gap-2">
            {(suggestions?.data ?? []).slice(0, 24).map((s) => (
              <button
                key={s.name}
                type="button"
                onClick={() => add.mutate({ name: s.name })}
                className="inline-flex items-center gap-1.5 rounded-md border border-border bg-surface px-2.5 py-1.5 text-[12px] text-text-secondary transition-colors hover:border-border-strong hover:text-text-primary"
              >
                <Plus className="h-3 w-3 text-text-muted" />
                <span className="max-w-[22rem] truncate">{s.name}</span>
                <span className="tabular-nums text-text-muted">{s.askedFor}</span>
              </button>
            ))}
          </div>
          <p className="mt-2.5 text-[11px] text-text-muted">
            The number is how many leads asked for it. Adding one creates the product with just a
            name — fill in strength and prices after.
          </p>
        </SectionCard>
      )}
    </div>
  )
}
