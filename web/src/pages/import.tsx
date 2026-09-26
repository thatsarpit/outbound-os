import { getSessionToken } from '@/stores/auth-store'
import { useState, useRef } from 'react'
import { useQuery, useQueryClient } from '@tanstack/react-query'
import { importApi } from '@/api/endpoints/import'
import { cn, formatNumber } from '@/lib/utils'
import { formatDate } from '@/lib/format-date'
import {
  Loader2,
  Upload,
  FileSpreadsheet,
  CheckCircle2,
  XCircle,
  AlertTriangle,
  Download,
  Clock,
} from 'lucide-react'
import { Button } from '@/components/ui'

interface ImportBatch {
  id: number
  filename: string
  imported: number
  skipped: number
  failed: number
  total: number
  createdAt: string
}

interface RawImportBatch {
  id: number
  filename: string
  imported?: number
  duplicates?: number
  failed?: number
  totalRows?: number
  createdAt: string
}

interface ImportResult {
  success: boolean
  imported: number
  skipped: number
  failed: number
  errors?: string[]
  totalInDb?: number
}

function safeNum(n: unknown): number {
  const parsed = Number(n)
  return isNaN(parsed) ? 0 : parsed
}

function safeDate(d: unknown): string {
  if (!d) return '–'
  try {
    return formatDate(String(d), 'medium', '—')
  } catch {
    return '–'
  }
}

export default function ImportPage() {
  const queryClient = useQueryClient()
  const fileRef = useRef<HTMLInputElement>(null)
  const [uploading, setUploading] = useState(false)
  const [exportError, setExportError] = useState<string | null>(null)
  const [lastResult, setLastResult] = useState<ImportResult | null>(null)
  const [dragOver, setDragOver] = useState(false)

  const {
    data: rawBatches,
    isLoading,
    error: batchError,
  } = useQuery({
    queryKey: ['import-batches'],
    queryFn: () => importApi.listBatches(),
    retry: 1,
  })

  const batches: ImportBatch[] = (() => {
    if (!rawBatches) return []
    if (Array.isArray(rawBatches)) {
      return (rawBatches as RawImportBatch[]).map((batch) => ({
        id: batch.id,
        filename: batch.filename,
        imported: safeNum(batch.imported),
        skipped: safeNum(batch.duplicates),
        failed: safeNum(batch.failed),
        total: safeNum(batch.totalRows),
        createdAt: batch.createdAt,
      }))
    }
    if (typeof rawBatches === 'object' && 'batches' in (rawBatches as object)) {
      const batches = (rawBatches as { batches?: ImportBatch[] })?.batches
      return Array.isArray(batches) ? batches : []
    }
    return []
  })()
  const importedTotal = batches.reduce((sum, batch) => sum + safeNum(batch.imported), 0)
  const skippedTotal = batches.reduce((sum, batch) => sum + safeNum(batch.skipped), 0)
  const failedTotal = batches.reduce((sum, batch) => sum + safeNum(batch.failed), 0)
  const latestBatch = batches[0]
  const latestBatchTotal = getBatchTotal(latestBatch)
  const latestSuccessRate = getBatchSuccessRate(latestBatch)

  const handleUpload = async (file: File) => {
    if (!file.name.toLowerCase().endsWith('.csv')) {
      setLastResult({
        success: false,
        imported: 0,
        skipped: 0,
        failed: 0,
        errors: ['Please upload a .csv file'],
      })
      return
    }

    setUploading(true)
    setLastResult(null)

    try {
      const formData = new FormData()
      formData.append('file', file)
      const result = await importApi.uploadCsv(file)
      setLastResult(
        result ?? {
          success: false,
          imported: 0,
          skipped: 0,
          failed: 0,
          errors: ['No response from server'],
        },
      )
      queryClient.invalidateQueries({ queryKey: ['import-batches'] })
    } catch (err) {
      setLastResult({
        success: false,
        imported: 0,
        skipped: 0,
        failed: 0,
        errors: [(err as Error).message],
      })
    } finally {
      setUploading(false)
    }
  }

  const handleDrop = (e: React.DragEvent) => {
    e.preventDefault()
    setDragOver(false)
    const file = e.dataTransfer.files[0]
    if (file) handleUpload(file)
  }

  const exportLeads = async () => {
    setExportError(null)
    try {
      const token = await getSessionToken()
      const res = await fetch('/api/export/csv', {
        headers: token ? { Authorization: `Bearer ${token}` } : {},
      })
      if (!res.ok) throw new Error('Export failed with status: ' + res.status)
      const blob = await res.blob()
      const url = URL.createObjectURL(blob)
      const a = document.createElement('a')
      a.href = url
      a.download = 'outbound-os-leads.csv'
      a.click()
      URL.revokeObjectURL(url)
    } catch (err) {
      setExportError((err as Error).message || 'Export failed')
    }
  }

  return (
    <div className="space-y-6 animate-fade-in">
      <section className="glass overflow-hidden rounded-lg p-6">
        <div className="grid gap-5 lg:grid-cols-[minmax(0,1.35fr)_minmax(320px,0.85fr)]">
          <div>
            <h1 className="text-xl font-semibold tracking-tight">Import</h1>
            <p className="mt-1 text-[13px] text-text-secondary">
              <span className="tabular-nums">{batches.length}</span>{' '}
              {batches.length === 1 ? 'batch' : 'batches'} &middot;{' '}
              <span className="tabular-nums">{formatNumber(importedTotal)}</span> leads imported
            </p>
            {/* The four boxed figures that were here restated the count line
                directly above them, and in an empty workspace showed 0 four
                times. Skipped and failed only matter when non-zero, so they
                appear only then. */}
            {(skippedTotal > 0 || failedTotal > 0) && (
              <p className="mt-3 text-[13px] text-text-secondary">
                <span className="tabular-nums text-warning">{formatNumber(skippedTotal)}</span>{' '}
                skipped &middot;{' '}
                <span className="tabular-nums text-danger">{formatNumber(failedTotal)}</span> failed
              </p>
            )}
          </div>
          <div className="rounded-lg border border-border bg-surface-raised/80 p-5">
            <div className="flex items-start justify-between gap-3">
              <div>
                <p className="text-xs font-semibold uppercase tracking-[0.18em] text-text-muted">
                  Latest batch
                </p>
                <p className="mt-2 text-sm font-medium text-text-primary">
                  {latestBatch ? latestBatch.filename : 'No imports yet'}
                </p>
                <p className="mt-1 text-xs text-text-muted">
                  {latestBatch
                    ? `Last run ${safeDate(latestBatch.createdAt)}`
                    : 'Upload a CSV to create the first history row.'}
                </p>
              </div>
              <div className="rounded-md border border-border bg-surface p-2">
                <Clock className="h-4 w-4 text-text-muted" />
              </div>
            </div>

            {latestBatch ? (
              <div className="mt-4 grid gap-3 sm:grid-cols-3">
                <div className="rounded-md border border-border bg-surface p-4">
                  <p className="text-[10px] uppercase tracking-[0.16em] text-text-muted">
                    Rows scanned
                  </p>
                  <p className="mt-2 text-2xl font-semibold tracking-tight">
                    {formatNumber(latestBatchTotal)}
                  </p>
                </div>
                <div className="rounded-md border border-border bg-surface p-4">
                  <p className="text-[10px] uppercase tracking-[0.16em] text-text-muted">Outcome</p>
                  <p className="mt-2 text-2xl font-semibold tracking-tight">
                    {formatNumber(safeNum(latestBatch.imported))}
                  </p>
                  <p className="mt-1 text-xs text-text-muted">Imported rows from the latest run.</p>
                </div>
                <div className="rounded-md border border-border bg-surface p-4">
                  <p className="text-[10px] uppercase tracking-[0.16em] text-text-muted">
                    Success rate
                  </p>
                  <p className="mt-2 text-2xl font-semibold tracking-tight">{latestSuccessRate}%</p>
                  <p className="mt-1 text-xs text-text-muted">
                    Imported rows as a share of rows scanned.
                  </p>
                </div>
              </div>
            ) : null}
          </div>
        </div>
      </section>

      <div className="grid grid-cols-1 gap-6 lg:grid-cols-2">
        <div
          className={cn(
            'cursor-pointer rounded-lg border border-dashed p-8 text-center transition-all',
            dragOver
              ? 'border-accent bg-accent-muted/30'
              : 'border-border bg-surface-raised/30 hover:bg-surface-raised/50 hover:border-accent/40',
          )}
          onDragOver={(e) => {
            e.preventDefault()
            setDragOver(true)
          }}
          onDragLeave={() => setDragOver(false)}
          onDrop={handleDrop}
          onClick={() => fileRef.current?.click()}
        >
          <input
            ref={fileRef}
            type="file"
            accept=".csv"
            className="hidden"
            onChange={(e) => {
              const file = e.target.files?.[0]
              if (file) handleUpload(file)
              e.target.value = ''
            }}
          />

          {uploading ? (
            <>
              <Loader2 className="mx-auto mb-3 h-10 w-10 animate-spin text-accent" />
              <p className="text-text-primary font-medium">Importing leads…</p>
              <p className="text-text-muted text-sm mt-1">This may take a moment</p>
            </>
          ) : (
            <>
              <Upload className="mx-auto mb-3 h-10 w-10 text-accent" />
              <p className="text-text-primary font-medium">Drop CSV file here</p>
              <p className="text-text-muted text-sm mt-1">or click to browse</p>
              <p className="text-text-muted text-xs mt-3">
                Required: <span className="font-mono text-accent">name, mobile</span>
              </p>
              <p className="text-text-muted text-xs">
                Optional:{' '}
                <span className="font-mono text-xs">email, company, country, product</span>
              </p>
            </>
          )}
        </div>

        <div className="glass flex flex-col items-center justify-between rounded-lg p-8 text-center transition-all hover:border-accent/30 hover:shadow-sm">
          <div>
            <Download className="mx-auto mb-3 h-8 w-8 text-text-muted" />
            <p className="font-medium text-text-primary">Export All Leads</p>
            <p className="mt-1 text-sm text-text-muted">
              Download a clean CSV snapshot for offline review or handoff.
            </p>
            <p className="mt-3 text-xs text-text-muted">
              Exports the current lead roster in the same shape operators expect during import.
            </p>
          </div>
          <Button
            onClick={exportLeads}
            className="mt-5"
            leftIcon={<Download className="w-4 h-4" />}
          >
            Download CSV
          </Button>
          {exportError && (
            <div className="mt-4 rounded-md border border-danger/20 bg-danger/10 px-4 py-3 text-left text-xs text-danger">
              {exportError}
            </div>
          )}
        </div>
      </div>

      {lastResult && (
        <div
          className={cn(
            'glass rounded-lg p-5',
            lastResult.success ? 'border-success/30' : 'border-danger/30',
          )}
        >
          <div className="mb-3 flex items-center gap-3">
            {lastResult.success ? (
              <CheckCircle2 className="w-5 h-5 text-success" />
            ) : (
              <XCircle className="w-5 h-5 text-danger" />
            )}
            <h3 className="text-sm font-semibold">
              {lastResult.success ? 'Import Complete' : 'Import Failed'}
            </h3>
          </div>
          <p className="mb-4 text-xs text-text-secondary">
            {lastResult.success
              ? 'The imported rows are now recorded in history with duplicate tracking and batch totals.'
              : 'Fix the CSV and retry. The error list below highlights the first issues that blocked the run.'}
          </p>

          <div className="grid grid-cols-1 gap-3 sm:grid-cols-3">
            <div className="rounded-md bg-success/10 p-3 text-center">
              <p className="text-lg font-bold text-success">{safeNum(lastResult.imported)}</p>
              <p className="text-[10px] text-text-muted">Imported</p>
            </div>
            <div className="rounded-md bg-warning/10 p-3 text-center">
              <p className="text-lg font-bold text-warning">{safeNum(lastResult.skipped)}</p>
              <p className="text-[10px] text-text-muted">Skipped</p>
            </div>
            <div className="rounded-md bg-danger/10 p-3 text-center">
              <p className="text-lg font-bold text-danger">{safeNum(lastResult.failed)}</p>
              <p className="text-[10px] text-text-muted">Failed</p>
            </div>
          </div>

          {lastResult.errors && lastResult.errors.length > 0 && (
            <div className="mt-3 space-y-1 rounded-md bg-danger/10 p-3">
              {lastResult.errors.slice(0, 5).map((err, i) => (
                <p key={i} className="text-xs text-danger flex items-center gap-1.5">
                  <AlertTriangle className="w-3 h-3 shrink-0" /> {err}
                </p>
              ))}
            </div>
          )}
        </div>
      )}

      <div className="glass overflow-hidden rounded-lg">
        <div className="flex flex-col gap-2 border-b border-border px-5 py-3 sm:flex-row sm:items-center sm:justify-between">
          <div className="flex items-center gap-2">
            <Clock className="w-4 h-4 text-text-muted" />
            <div>
              <h3 className="text-sm font-semibold">Import History</h3>
              <p className="text-xs text-text-muted">
                Keep an eye on duplicate-heavy files and unusually noisy runs.
              </p>
            </div>
          </div>
          {latestBatch && (
            <span className="rounded-full bg-surface-raised px-2.5 py-1 text-[10px] text-text-muted">
              Latest: {safeDate(latestBatch.createdAt)}
            </span>
          )}
        </div>

        {isLoading ? (
          <div className="flex justify-center py-8">
            <Loader2 className="w-5 h-5 text-accent animate-spin" />
          </div>
        ) : batchError ? (
          <div className="px-5 py-12 text-center">
            <AlertTriangle className="mx-auto h-10 w-10 text-danger/50" />
            <p className="mt-4 text-sm font-medium text-text-primary">
              Could not load import history
            </p>
            <p className="mt-2 text-sm text-text-secondary">
              Refresh the page or try again once the import API is available.
            </p>
          </div>
        ) : batches.length === 0 ? (
          <div className="px-5 py-12 text-center">
            <FileSpreadsheet className="mx-auto mb-3 h-10 w-10 text-text-muted/40 animate-pulse" />
            <p className="text-sm font-medium text-text-secondary">No imports yet</p>
            <p className="mt-1 text-sm text-text-muted">
              Your CSV runs will appear here with row-level summaries and duplicate tracking.
            </p>
          </div>
        ) : (
          <div className="divide-y divide-border/40">
            {batches.map((b, i) => (
              <div
                key={b.id ?? i}
                className="grid gap-3 px-5 py-4 transition-colors hover:bg-surface-raised lg:grid-cols-[minmax(0,1.25fr)_repeat(4,minmax(90px,0.18fr))_110px] lg:items-center"
              >
                <div className="min-w-0">
                  <div className="flex items-center gap-2">
                    <FileSpreadsheet className="w-4 h-4 shrink-0 text-success" />
                    <span className="truncate text-sm font-medium">{b.filename ?? 'Unknown'}</span>
                  </div>
                  <p className="mt-1 text-xs text-text-muted">Imported {safeDate(b.createdAt)}</p>
                </div>
                <BatchMetric label="Imported" value={safeNum(b.imported)} accent="text-success" />
                <BatchMetric label="Skipped" value={safeNum(b.skipped)} accent="text-warning" />
                <BatchMetric label="Failed" value={safeNum(b.failed)} accent="text-danger" />
                <BatchMetric label="Total" value={safeNum(b.total)} accent="text-text-primary" />
                <div className="text-left text-xs text-text-muted lg:text-right">
                  {safeDate(b.createdAt)}
                </div>
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  )
}

function BatchMetric({ label, value, accent }: { label: string; value: number; accent: string }) {
  return (
    <div className="rounded-md border border-border bg-surface-raised px-3 py-2 text-left lg:text-center">
      <p className={cn('text-sm font-semibold', accent)}>{formatNumber(value)}</p>
      <p className="mt-1 text-[10px] uppercase tracking-[0.16em] text-text-muted">{label}</p>
    </div>
  )
}

function getBatchTotal(batch: ImportBatch | undefined): number {
  if (!batch) return 0
  const explicit = safeNum(batch.total)
  if (explicit > 0) return explicit
  return safeNum(batch.imported) + safeNum(batch.skipped) + safeNum(batch.failed)
}

function getBatchSuccessRate(batch: ImportBatch | undefined): string {
  const total = getBatchTotal(batch)
  if (!total) return '0.0'
  return ((safeNum(batch?.imported) / total) * 100).toFixed(1)
}
