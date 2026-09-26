import { useState, useEffect } from 'react'
import { useQuery, useQueryClient } from '@tanstack/react-query'
import { api } from '@/api/client'
import { Button, Input } from '@/components/ui'
import { cn } from '@/lib/utils'
import { Loader2, Sheet, Check, CheckCircle2, AlertCircle, TestTube, Play } from 'lucide-react'

interface SheetsConfig {
  url: string | null
  enabled: boolean
  events: string[]
}

const ALL_EVENTS = [
  { id: 'lead.created', label: 'Lead created' },
  { id: 'lead.replied', label: 'Lead replied' },
  { id: 'lead.engaged', label: 'Lead engaged' },
  { id: 'lead.status_changed', label: 'Status changed' },
]

/**
 * A thrown value is `unknown`, not `Error` — anything can be thrown, and
 * asserting `any` here is what the linter was objecting to. Narrow, then fall
 * back to a message the user can act on.
 */
function errorMessage(error: unknown, fallback: string): string {
  if (error instanceof Error && error.message) return error.message
  if (typeof error === 'string' && error) return error
  return fallback
}

export default function GoogleSheetsSection() {
  const queryClient = useQueryClient()
  const [webhookUrl, setWebhookUrl] = useState('')
  const [enabled, setEnabled] = useState(false)
  const [events, setEvents] = useState<string[]>(['lead.created', 'lead.replied', 'lead.engaged'])
  const [testResult, setTestResult] = useState<{ ok: boolean; error?: string } | null>(null)
  const [backfillResult, setBackfillResult] = useState<string | null>(null)
  const [saving, setSaving] = useState(false)
  const [testing, setTesting] = useState(false)
  const [backfilling, setBackfilling] = useState(false)

  const { isLoading, data: sheetsConfig } = useQuery({
    queryKey: ['sheets-config'],
    queryFn: () => api.get<SheetsConfig>('/settings/sheets-webhook'),
    staleTime: Infinity,
  })

  // Hydrate form state once on first load
  useEffect(() => {
    if (!sheetsConfig) return
    const cfg = sheetsConfig as SheetsConfig
    setWebhookUrl(cfg.url ?? '')
    setEnabled(cfg.enabled)
    setEvents(cfg.events)
  }, [sheetsConfig])

  function toggleEvent(id: string) {
    setEvents((prev) => (prev.includes(id) ? prev.filter((e) => e !== id) : [...prev, id]))
    setTestResult(null)
  }

  async function handleSave() {
    if (!webhookUrl.trim()) return
    setSaving(true)
    try {
      await api.post('/settings/sheets-webhook', { url: webhookUrl.trim(), enabled, events })
      queryClient.invalidateQueries({ queryKey: ['sheets-config'] })
      setTestResult(null)
    } finally {
      setSaving(false)
    }
  }

  async function handleTest() {
    if (!webhookUrl.trim()) return
    setTesting(true)
    setTestResult(null)
    try {
      await api.post('/settings/sheets-webhook/test', { url: webhookUrl.trim() })
      setTestResult({ ok: true })
    } catch (e: unknown) {
      setTestResult({ ok: false, error: errorMessage(e, 'Connection failed') })
    } finally {
      setTesting(false)
    }
  }

  async function handleBackfill() {
    setBackfilling(true)
    setBackfillResult(null)
    try {
      const res = await api.post<{ count: number; message: string }>('/lead-sync/run', {})
      setBackfillResult((res as { count: number; message: string }).message)
    } catch (e: unknown) {
      setBackfillResult(`Error: ${errorMessage(e, 'Backfill failed')}`)
    } finally {
      setBackfilling(false)
    }
  }

  if (isLoading) {
    return (
      <div className="flex items-center justify-center py-20">
        <Loader2 className="h-6 w-6 animate-spin text-accent" />
      </div>
    )
  }

  return (
    <div className="space-y-4">
      {/* Setup card */}
      <div className="glass rounded-lg overflow-hidden">
        <div className="border-b border-border px-6 py-5 flex items-center justify-between">
          <div className="flex items-center gap-3">
            <div className="flex h-9 w-9 items-center justify-center rounded-md bg-accent-muted">
              <Sheet className="h-4 w-4 text-accent" />
            </div>
            <div>
              <p className="text-sm font-semibold text-text-primary">Google Sheets webhook</p>
              <p className="text-xs text-text-muted">
                Push lead events to a sheet via Google Apps Script
              </p>
            </div>
          </div>
          {/* Enable toggle */}
          <button
            type="button"
            onClick={() => setEnabled(!enabled)}
            className={cn(
              'relative inline-flex h-6 w-11 items-center rounded-full transition-colors focus:outline-none',
              enabled ? 'bg-accent' : 'bg-border',
            )}
            aria-label={enabled ? 'Disable sync' : 'Enable sync'}
          >
            <span
              className={cn(
                'inline-block h-4 w-4 rounded-full bg-white shadow transition-transform',
                enabled ? 'translate-x-6' : 'translate-x-1',
              )}
            />
          </button>
        </div>

        <div className="px-6 py-6 space-y-6">
          {/* Webhook URL */}
          <div className="space-y-2">
            <label className="text-xs font-semibold uppercase tracking-[0.18em] text-text-muted">
              Apps Script Webhook URL
            </label>
            <div className="flex gap-2">
              <Input
                value={webhookUrl}
                onChange={(e) => {
                  setWebhookUrl(e.target.value)
                  setTestResult(null)
                }}
                placeholder="https://script.google.com/macros/s/.../exec"
                className="flex-1 font-mono text-xs"
              />
              <Button
                variant="secondary"
                size="sm"
                onClick={handleTest}
                isLoading={testing}
                disabled={!webhookUrl.trim() || testing}
              >
                <TestTube className="h-3.5 w-3.5 mr-1.5" />
                Test
              </Button>
            </div>
            {testResult && (
              <div
                className={cn(
                  'flex items-center gap-2 rounded-md px-3 py-2 text-xs',
                  testResult.ok
                    ? 'bg-success-muted text-success border border-success/20'
                    : 'bg-danger-muted text-danger border border-danger/20',
                )}
              >
                {testResult.ok ? (
                  <>
                    <CheckCircle2 className="h-3.5 w-3.5 shrink-0" /> Connected — test row sent to
                    your sheet
                  </>
                ) : (
                  <>
                    <AlertCircle className="h-3.5 w-3.5 shrink-0" /> {testResult.error}
                  </>
                )}
              </div>
            )}
          </div>

          {/* Event checkboxes */}
          <div className="space-y-2">
            <label className="text-xs font-semibold uppercase tracking-[0.18em] text-text-muted">
              Push on these events
            </label>
            <div className="grid grid-cols-2 gap-2 sm:grid-cols-4">
              {ALL_EVENTS.map((ev) => {
                const checked = events.includes(ev.id)
                return (
                  <button
                    key={ev.id}
                    type="button"
                    onClick={() => toggleEvent(ev.id)}
                    className={cn(
                      'flex items-center gap-2 rounded-md border px-3 py-2.5 text-xs font-medium transition-colors text-left',
                      checked
                        ? 'border-accent/40 bg-accent-muted text-accent'
                        : 'border-border bg-surface-raised text-text-muted hover:text-text-primary',
                    )}
                  >
                    <span
                      className={cn(
                        'flex h-4 w-4 shrink-0 items-center justify-center rounded border',
                        checked ? 'border-accent bg-accent' : 'border-border bg-surface',
                      )}
                    >
                      {checked && <Check className="h-2.5 w-2.5 text-accent-fg" />}
                    </span>
                    {ev.label}
                  </button>
                )
              })}
            </div>
          </div>

          {/* Save */}
          <div className="flex items-center gap-3">
            <Button onClick={handleSave} isLoading={saving} disabled={!webhookUrl.trim() || saving}>
              Save configuration
            </Button>
            <p className="text-xs text-text-muted">Changes take effect immediately.</p>
          </div>
        </div>
      </div>

      {/* Backfill card */}
      <div className="glass rounded-lg overflow-hidden">
        <div className="px-6 py-5 flex items-start justify-between gap-4">
          <div className="flex items-start gap-3">
            <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-md bg-surface-raised mt-0.5">
              <Play className="h-4 w-4 text-text-secondary" />
            </div>
            <div>
              <p className="text-sm font-semibold text-text-primary">Backfill existing leads</p>
              <p className="text-xs text-text-muted mt-0.5">
                Push all leads in your current pool to Google Sheets as{' '}
                <code className="rounded bg-surface-raised px-1 py-0.5 font-mono text-[10px]">
                  lead.created
                </code>{' '}
                events. Runs in the background — safe to navigate away.
              </p>
              {backfillResult && (
                <p
                  className={cn(
                    'mt-2 text-xs',
                    backfillResult.startsWith('Error') ? 'text-danger' : 'text-success',
                  )}
                >
                  {backfillResult}
                </p>
              )}
            </div>
          </div>
          <Button
            variant="secondary"
            size="sm"
            onClick={handleBackfill}
            isLoading={backfilling}
            disabled={backfilling}
            className="shrink-0"
          >
            {backfilling ? 'Running…' : 'Run backfill'}
          </Button>
        </div>
      </div>

      {/* Setup instructions */}
      <div className="glass rounded-lg px-6 py-5">
        <p className="text-xs font-semibold uppercase tracking-[0.18em] text-text-muted mb-3">
          Setup instructions
        </p>
        <ol className="space-y-2 text-xs text-text-secondary list-decimal list-inside">
          <li>
            Open your Google Sheet →{' '}
            <span className="text-text-primary">Extensions → Apps Script</span>
          </li>
          <li>
            Paste the adapter code (available in{' '}
            <code className="rounded bg-surface-raised px-1 py-0.5 font-mono text-[10px]">
              src/services/sheetsSync.js
            </code>{' '}
            header comment)
          </li>
          <li>
            Deploy as Web App:{' '}
            <span className="text-text-primary">Execute as Me, Access Anyone with link</span>
          </li>
          <li>Copy the deployment URL and paste it above</li>
          <li>
            Click <span className="text-text-primary">Test</span> to verify the connection, then{' '}
            <span className="text-text-primary">Save</span>
          </li>
        </ol>
      </div>
    </div>
  )
}
