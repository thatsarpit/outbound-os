import { useEffect, useState } from 'react'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { settingsApi } from '@/api/endpoints/settings'
import { toast } from '@/stores/toast-store'
import { cn, formatRelativeTime } from '@/lib/utils'
import { ConfirmDialog } from '@/components/ui/confirm-dialog'
import { ExternalLink, Link2, Loader2, RefreshCw, Save, TestTube, Trash2 } from 'lucide-react'

export function SheetsTab() {
  const queryClient = useQueryClient()
  const [url, setUrl] = useState('')
  const [enabled, setEnabled] = useState(true)
  const [confirmingDelete, setConfirmingDelete] = useState(false)

  const { data, isLoading } = useQuery({
    queryKey: ['sheets-webhook'],
    queryFn: () => settingsApi.getSheetsWebhook(),
  })

  useEffect(() => {
    if (data) {
      setUrl(data.url ?? '')
      setEnabled(data.enabled ?? true)
    }
  }, [data])

  const saveMutation = useMutation({
    mutationFn: () => settingsApi.setSheetsWebhook({ url, enabled }),
    onSuccess: () => {
      toast.success('Sheets webhook saved')
      queryClient.invalidateQueries({ queryKey: ['sheets-webhook'] })
    },
    onError: (e: Error) => toast.error(e.message || 'Save failed'),
  })

  const testMutation = useMutation({
    mutationFn: () => settingsApi.testSheetsWebhook(),
    onSuccess: (res) => {
      if (res?.success) toast.success(res.message || 'Test delivery succeeded')
      else toast.error(res?.message || 'Test failed')
    },
    onError: (e: Error) => toast.error(e.message || 'Test failed'),
  })

  const deleteMutation = useMutation({
    mutationFn: () => settingsApi.deleteSheetsWebhook(),
    onSuccess: () => {
      toast.success('Sheets webhook removed')
      setUrl('')
      setEnabled(true)
      queryClient.invalidateQueries({ queryKey: ['sheets-webhook'] })
    },
    onError: (e: Error) => toast.error(e.message || 'Delete failed'),
  })

  if (isLoading) {
    return (
      <div className="flex justify-center py-12">
        <Loader2 className="h-5 w-5 animate-spin text-accent" />
      </div>
    )
  }

  const configured = !!data?.url

  return (
    <div className="space-y-4">
      <div className="rounded-lg border border-border bg-surface p-5 shadow-sm">
        <div className="flex flex-col gap-3 md:flex-row md:items-center md:justify-between">
          <div>
            <p className="text-sm font-semibold">Google Sheets sync</p>
            <p className="mt-1 text-sm text-text-secondary">
              Every new or updated lead is POSTed to your Google Sheets webhook (Apps Script
              endpoint).
            </p>
          </div>
          <a
            href="https://developers.google.com/apps-script/guides/web"
            target="_blank"
            rel="noreferrer"
            className="inline-flex items-center gap-1.5 text-xs font-medium text-accent hover:underline"
          >
            Apps Script docs
            <ExternalLink className="h-3 w-3" />
          </a>
        </div>

        <div className="mt-4 grid grid-cols-1 gap-3 sm:grid-cols-3">
          <Stat
            label="Status"
            value={configured ? (enabled ? 'Active' : 'Paused') : 'Not configured'}
            tone={configured && enabled ? 'success' : 'muted'}
          />
          <Stat label="Leads synced" value={String(data?.totalSynced ?? 0)} />
          <Stat
            label="Last sync"
            value={data?.lastSyncAt ? formatRelativeTime(data.lastSyncAt) : 'never'}
          />
        </div>
      </div>

      <form
        onSubmit={(e) => {
          e.preventDefault()
          if (!url.trim()) return
          saveMutation.mutate()
        }}
        className="rounded-lg border border-border bg-surface p-5 shadow-sm space-y-4"
      >
        <label className="block text-xs font-semibold uppercase tracking-[0.18em] text-text-muted">
          Webhook URL
          <input
            type="url"
            required
            value={url}
            onChange={(e) => setUrl(e.target.value)}
            placeholder="https://script.google.com/macros/s/…/exec"
            className="form-input mt-2 font-mono text-sm"
          />
        </label>

        <label className="flex items-center gap-3 rounded-md border border-border bg-surface-raised px-4 py-3">
          <input
            type="checkbox"
            checked={enabled}
            onChange={(e) => setEnabled(e.target.checked)}
            className="h-4 w-4 rounded border-border text-accent focus:ring-accent"
          />
          <span className="flex-1">
            <span className="block text-sm font-medium text-text-primary">Enabled</span>
            <span className="block text-xs text-text-secondary">
              When disabled, we stop POSTing lead events to Sheets but keep the URL configured.
            </span>
          </span>
        </label>

        <div className="flex flex-wrap items-center gap-2">
          <button
            type="submit"
            disabled={saveMutation.isPending || !url.trim()}
            className="inline-flex items-center gap-2 rounded-md bg-accent px-4 py-2 text-sm font-semibold text-accent-fg transition-colors hover:bg-accent-hover disabled:opacity-50"
          >
            {saveMutation.isPending ? (
              <Loader2 className="h-4 w-4 animate-spin" />
            ) : (
              <Save className="h-4 w-4" />
            )}
            Save
          </button>

          <button
            type="button"
            onClick={() => testMutation.mutate()}
            disabled={!configured || testMutation.isPending}
            className="inline-flex items-center gap-2 rounded-md border border-border bg-surface-raised px-4 py-2 text-sm font-medium text-text-primary transition-colors hover:bg-surface-overlay disabled:opacity-50"
          >
            {testMutation.isPending ? (
              <Loader2 className="h-4 w-4 animate-spin" />
            ) : (
              <TestTube className="h-4 w-4" />
            )}
            Test delivery
          </button>

          <button
            type="button"
            onClick={() => queryClient.invalidateQueries({ queryKey: ['sheets-webhook'] })}
            className="inline-flex items-center gap-2 rounded-md border border-border bg-surface-raised px-4 py-2 text-sm font-medium text-text-secondary transition-colors hover:text-text-primary"
          >
            <RefreshCw className="h-4 w-4" />
            Refresh
          </button>

          <div className="flex-1" />

          {configured && (
            <button
              type="button"
              onClick={() => setConfirmingDelete(true)}
              className="inline-flex items-center gap-2 rounded-md border border-border bg-surface-raised px-4 py-2 text-sm font-medium text-text-muted transition-colors hover:bg-danger-muted hover:text-danger"
            >
              <Trash2 className="h-4 w-4" />
              Remove
            </button>
          )}
        </div>
      </form>

      <div className="rounded-lg border border-border bg-surface-raised/40 p-5">
        <p className="flex items-center gap-2 text-sm font-semibold text-text-primary">
          <Link2 className="h-4 w-4 text-accent" /> How to set this up
        </p>
        <ol className="mt-3 space-y-2 text-sm leading-relaxed text-text-secondary">
          <li>
            1. Create a Google Sheet and open{' '}
            <span className="font-mono text-xs">Extensions → Apps Script</span>.
          </li>
          <li>
            2. Paste a <span className="font-mono text-xs">doPost(e)</span> handler that appends
            <span className="font-mono text-xs"> JSON.parse(e.postData.contents)</span> to a sheet
            row.
          </li>
          <li>
            3. Deploy as web app (execute as you, accessible to anyone), copy the URL above, and hit
            Test.
          </li>
        </ol>
      </div>

      <ConfirmDialog
        open={confirmingDelete}
        title="Remove Sheets webhook?"
        body="Lead events will no longer be pushed to your Google Sheet. You can re-add it later."
        confirmLabel="Remove"
        tone="danger"
        busy={deleteMutation.isPending}
        onClose={() => setConfirmingDelete(false)}
        onConfirm={async () => {
          await deleteMutation.mutateAsync()
          setConfirmingDelete(false)
        }}
      />
    </div>
  )
}

function Stat({
  label,
  value,
  tone = 'muted',
}: {
  label: string
  value: string
  tone?: 'muted' | 'success'
}) {
  return (
    <div className="rounded-md border border-border bg-surface-raised/50 p-3">
      <p className="text-[10px] font-semibold uppercase tracking-[0.18em] text-text-muted">
        {label}
      </p>
      <p
        className={cn(
          'mt-1 text-sm font-semibold',
          tone === 'success' ? 'text-success' : 'text-text-primary',
        )}
      >
        {value}
      </p>
    </div>
  )
}
