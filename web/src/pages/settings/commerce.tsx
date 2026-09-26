import { useState } from 'react'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { CreditCard, Factory, Plus, Trash2 } from 'lucide-react'
import { salesApi, bpsToPercent, type PaymentMethod, type Supplier } from '@/api/endpoints/sales'
import { SettingsPanel } from '@/components/settings/settings-panel'
import { Button } from '@/components/ui/button'
import { Badge } from '@/components/ui/badge'
import { toast } from '@/stores/toast-store'
import { cn } from '@/lib/utils'

/**
 * Payment methods and suppliers.
 *
 * These drive the money on every order, and they are editable here rather than
 * fixed in code because the rates change, differ per account, and are the
 * user's business rules — not ours.
 *
 * Fee rates are entered as a percentage and stored as basis points, so 2.9% is
 * expressible. A percent held as an integer could not represent it, and held
 * as a float it drifts once it multiplies a real total.
 */

const inputClass =
  'h-8 w-full rounded-md border border-border bg-surface px-2 text-[13px] text-text-primary placeholder:text-text-muted focus:border-focus focus:outline-none focus:ring-3 focus:ring-focus-muted'

export default function CommerceSettingsPage() {
  const queryClient = useQueryClient()
  const invalidate = () => {
    queryClient.invalidateQueries({ queryKey: ['payment-methods'] })
    queryClient.invalidateQueries({ queryKey: ['suppliers'] })
  }

  const { data: methods } = useQuery({
    queryKey: ['payment-methods'],
    queryFn: () => salesApi.listPaymentMethods(),
  })
  const { data: suppliers } = useQuery({
    queryKey: ['suppliers'],
    queryFn: () => salesApi.listSuppliers(),
  })

  const [newMethod, setNewMethod] = useState({ name: '', percent: '' })
  const [newSupplier, setNewSupplier] = useState({ name: '', matchTag: '' })

  const saveMethod = useMutation({
    mutationFn: ({ id, patch }: { id: number; patch: Partial<PaymentMethod> }) =>
      salesApi.updatePaymentMethod(id, patch),
    onSuccess: () => {
      invalidate()
      toast.success('Payment method updated')
    },
    onError: (e: Error) => toast.error(e.message),
  })
  const addMethod = useMutation({
    mutationFn: () =>
      salesApi.createPaymentMethod({
        name: newMethod.name.trim(),
        feeBps: Math.round((Number(newMethod.percent) || 0) * 100),
      }),
    onSuccess: () => {
      setNewMethod({ name: '', percent: '' })
      invalidate()
      toast.success('Payment method added')
    },
    onError: (e: Error) => toast.error(e.message),
  })
  const removeMethod = useMutation({
    mutationFn: (id: number) => salesApi.deletePaymentMethod(id),
    onSuccess: (res) => {
      invalidate()
      const r = res as { disabled?: boolean; reason?: string } | undefined
      toast.success(r?.disabled ? `Disabled — ${r.reason}` : 'Payment method removed')
    },
    onError: (e: Error) => toast.error(e.message),
  })

  const saveSupplier = useMutation({
    mutationFn: ({ id, patch }: { id: number; patch: Partial<Supplier> }) =>
      salesApi.updateSupplier(id, patch),
    onSuccess: () => {
      invalidate()
      toast.success('Supplier updated')
    },
    onError: (e: Error) => toast.error(e.message),
  })
  const addSupplier = useMutation({
    mutationFn: () =>
      salesApi.createSupplier({
        name: newSupplier.name.trim(),
        matchTag: newSupplier.matchTag.trim() || null,
      }),
    onSuccess: () => {
      setNewSupplier({ name: '', matchTag: '' })
      invalidate()
      toast.success('Supplier added')
    },
    onError: (e: Error) => toast.error(e.message),
  })
  const removeSupplier = useMutation({
    mutationFn: (id: number) => salesApi.deleteSupplier(id),
    onSuccess: (res) => {
      invalidate()
      const r = res as { disabled?: boolean; reason?: string } | undefined
      toast.success(r?.disabled ? `Disabled — ${r.reason}` : 'Supplier removed')
    },
    onError: (e: Error) => toast.error(e.message),
  })

  return (
    <>
      <SettingsPanel
        icon={CreditCard}
        title="Payment methods"
        description="What each way of paying costs, and whether the customer covers it. Applied to orders at the rate stored here; changing a rate does not alter orders that already settled."
      >
        <div className="overflow-x-auto">
          <table className="w-full text-sm" style={{ minWidth: 640 }}>
            <thead>
              <tr className="border-b border-border text-[11px] uppercase tracking-[0.06em] text-text-muted">
                <th className="px-2 py-2 text-left font-medium">Method</th>
                <th className="px-2 py-2 text-right font-medium">Fee</th>
                <th className="px-2 py-2 text-left font-medium">Default handling</th>
                <th className="px-2 py-2 text-left font-medium">Status</th>
                <th className="px-2 py-2" />
              </tr>
            </thead>
            <tbody>
              {(methods?.data ?? []).map((m) => (
                <tr key={m.id} className="border-b border-border-subtle last:border-0">
                  <td className="px-2 py-2">
                    <input
                      className={inputClass}
                      defaultValue={m.name}
                      onBlur={(e) => {
                        if (e.target.value !== m.name)
                          saveMethod.mutate({ id: m.id, patch: { name: e.target.value } })
                      }}
                    />
                  </td>
                  <td className="px-2 py-2">
                    <div className="flex items-center justify-end gap-1">
                      <input
                        className={cn(inputClass, 'w-20 text-right')}
                        inputMode="decimal"
                        defaultValue={(m.feeBps / 100).toString()}
                        onBlur={(e) => {
                          const bps = Math.round((Number(e.target.value) || 0) * 100)
                          if (bps !== m.feeBps)
                            saveMethod.mutate({ id: m.id, patch: { feeBps: bps } })
                        }}
                      />
                      <span className="text-[13px] text-text-muted">%</span>
                    </div>
                  </td>
                  <td className="px-2 py-2">
                    <select
                      className={inputClass}
                      value={m.passOnByDefault ? 'pass_on' : 'absorb'}
                      onChange={(e) =>
                        saveMethod.mutate({
                          id: m.id,
                          patch: { passOnByDefault: e.target.value === 'pass_on' },
                        })
                      }
                    >
                      <option value="absorb">We absorb it</option>
                      <option value="pass_on">Client pays it</option>
                    </select>
                  </td>
                  <td className="px-2 py-2">
                    <button
                      type="button"
                      onClick={() =>
                        saveMethod.mutate({ id: m.id, patch: { enabled: !m.enabled } })
                      }
                    >
                      <Badge variant={m.enabled ? 'success' : 'neutral'}>
                        {m.enabled ? 'Enabled' : 'Disabled'}
                      </Badge>
                    </button>
                  </td>
                  <td className="px-2 py-2 text-right">
                    <button
                      type="button"
                      aria-label={`Remove ${m.name}`}
                      onClick={() => removeMethod.mutate(m.id)}
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

        <div className="mt-3 flex flex-wrap items-end gap-2 border-t border-border pt-3">
          <label className="min-w-0 flex-1">
            <span className="text-[12px] font-medium text-text-secondary">New method</span>
            <input
              className={cn(inputClass, 'mt-1')}
              placeholder="e.g. Wise"
              value={newMethod.name}
              onChange={(e) => setNewMethod({ ...newMethod, name: e.target.value })}
            />
          </label>
          <label className="w-28">
            <span className="text-[12px] font-medium text-text-secondary">Fee %</span>
            <input
              className={cn(inputClass, 'mt-1')}
              inputMode="decimal"
              placeholder="0"
              value={newMethod.percent}
              onChange={(e) => setNewMethod({ ...newMethod, percent: e.target.value })}
            />
          </label>
          <Button
            size="sm"
            variant="secondary"
            leftIcon={<Plus className="h-3.5 w-3.5" />}
            disabled={!newMethod.name.trim()}
            pending={addMethod.isPending}
            onClick={() => addMethod.mutate()}
          >
            Add
          </Button>
        </div>
      </SettingsPanel>

      <SettingsPanel
        icon={Factory}
        title="Suppliers"
        description="Who fulfils an order. The match tag routes a lead to its supplier automatically — a lead tagged acme becomes an Acme order. Lower priority wins when a lead carries more than one supplier's tag."
      >
        <div className="overflow-x-auto">
          <table className="w-full text-sm" style={{ minWidth: 640 }}>
            <thead>
              <tr className="border-b border-border text-[11px] uppercase tracking-[0.06em] text-text-muted">
                <th className="px-2 py-2 text-left font-medium">Supplier</th>
                <th className="px-2 py-2 text-left font-medium">Match tag</th>
                <th className="px-2 py-2 text-right font-medium">Priority</th>
                <th className="px-2 py-2 text-right font-medium">Orders</th>
                <th className="px-2 py-2 text-left font-medium">Status</th>
                <th className="px-2 py-2" />
              </tr>
            </thead>
            <tbody>
              {(suppliers?.data ?? []).map((s) => (
                <tr key={s.id} className="border-b border-border-subtle last:border-0">
                  <td className="px-2 py-2">
                    <input
                      className={inputClass}
                      defaultValue={s.name}
                      onBlur={(e) => {
                        if (e.target.value !== s.name)
                          saveSupplier.mutate({ id: s.id, patch: { name: e.target.value } })
                      }}
                    />
                  </td>
                  <td className="px-2 py-2">
                    <input
                      className={inputClass}
                      placeholder="lead tag"
                      defaultValue={s.matchTag ?? ''}
                      onBlur={(e) => {
                        if (e.target.value !== (s.matchTag ?? '')) {
                          saveSupplier.mutate({ id: s.id, patch: { matchTag: e.target.value } })
                        }
                      }}
                    />
                  </td>
                  <td className="px-2 py-2">
                    <input
                      className={cn(inputClass, 'w-20 text-right')}
                      inputMode="numeric"
                      defaultValue={String(s.matchPriority)}
                      onBlur={(e) => {
                        const n = Number(e.target.value) || 0
                        if (n !== s.matchPriority)
                          saveSupplier.mutate({ id: s.id, patch: { matchPriority: n } })
                      }}
                    />
                  </td>
                  <td className="px-2 py-2 text-right tabular-nums text-text-secondary">
                    {s.orderCount ?? 0}
                  </td>
                  <td className="px-2 py-2">
                    <button
                      type="button"
                      onClick={() =>
                        saveSupplier.mutate({ id: s.id, patch: { enabled: !s.enabled } })
                      }
                    >
                      <Badge variant={s.enabled ? 'success' : 'neutral'}>
                        {s.enabled ? 'Enabled' : 'Disabled'}
                      </Badge>
                    </button>
                  </td>
                  <td className="px-2 py-2 text-right">
                    <button
                      type="button"
                      aria-label={`Remove ${s.name}`}
                      onClick={() => removeSupplier.mutate(s.id)}
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

        <div className="mt-3 flex flex-wrap items-end gap-2 border-t border-border pt-3">
          <label className="min-w-0 flex-1">
            <span className="text-[12px] font-medium text-text-secondary">New supplier</span>
            <input
              className={cn(inputClass, 'mt-1')}
              placeholder="Supplier name"
              value={newSupplier.name}
              onChange={(e) => setNewSupplier({ ...newSupplier, name: e.target.value })}
            />
          </label>
          <label className="w-40">
            <span className="text-[12px] font-medium text-text-secondary">Match tag</span>
            <input
              className={cn(inputClass, 'mt-1')}
              placeholder="lead tag"
              value={newSupplier.matchTag}
              onChange={(e) => setNewSupplier({ ...newSupplier, matchTag: e.target.value })}
            />
          </label>
          <Button
            size="sm"
            variant="secondary"
            leftIcon={<Plus className="h-3.5 w-3.5" />}
            disabled={!newSupplier.name.trim()}
            pending={addSupplier.isPending}
            onClick={() => addSupplier.mutate()}
          >
            Add
          </Button>
        </div>
      </SettingsPanel>
    </>
  )
}

/** Exported for the settings nav summary. */
export const paymentMethodSummary = (m: PaymentMethod) =>
  m.feeBps > 0 ? `${m.name} ${bpsToPercent(m.feeBps)}` : `${m.name} (no fee)`
