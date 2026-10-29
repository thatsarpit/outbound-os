import { useState } from 'react'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { api } from '@/api/client'
import { useAuthStore } from '@/stores/auth-store'
import { Button } from '@/components/ui'
import { toast } from '@/stores/toast-store'

interface Job {
  id: string
  status: string
  total: number
  checked: number
  counts: { ready?: number; invalid?: number; unknown?: number }
  createdAt: string
  error: string | null
}
interface Results extends Job {
  page: number
  pages: number
  results: { email: string; status: string; reason?: string }[]
}

export function EmailVerificationPanel() {
  const { user, dashboardScope } = useAuthStore()
  const client = useQueryClient()
  const [emails, setEmails] = useState('')
  const [selected, setSelected] = useState<string | null>(null)
  const [page, setPage] = useState(1)
  const allowed = user?.role === 'admin'
  const batches = useQuery({
    queryKey: ['email-verification-jobs', dashboardScope],
    queryFn: async () => {
      const result = await api.get<{ enabled: boolean; jobs: Job[] }>('/email/verification/jobs')
      if (!result) throw new Error('The verification response was empty.')
      return result
    },
    enabled: allowed,
    refetchInterval: 5000,
    meta: { silent: true },
  })
  const results = useQuery({
    queryKey: ['email-verification-results', dashboardScope, selected, page],
    queryFn: async () => {
      const result = await api.get<Results>(`/email/verification/jobs/${selected}?page=${page}`)
      if (!result) throw new Error('The verification response was empty.')
      return result
    },
    enabled: allowed && Boolean(selected),
    refetchInterval: 5000,
    meta: { silent: true },
  })
  const create = useMutation({
    mutationFn: async (allLeads: boolean) => {
      const result = await api.post<Job>('/email/verification/jobs', allLeads ? { allLeads: true } : { emails: emails.split(/[\s,;]+/).filter(Boolean) })
      if (!result) throw new Error('The verification batch could not be confirmed.')
      return result
    },
    onSuccess: job => {
      setSelected(job.id); setPage(1)
      void client.invalidateQueries({ queryKey: ['email-verification-jobs'] })
      toast.success('Email verification started. No email will be sent.')
    },
    onError: (error: Error) => toast.error(error.message),
  })
  if (!allowed) return null
  return (
    <section aria-labelledby="email-verification-title" className="space-y-4 rounded-lg border border-border bg-surface p-4 sm:p-5">
      <div>
        <h2 id="email-verification-title" className="text-sm font-semibold">Email verification</h2>
        <p className="mt-1 max-w-3xl text-xs leading-5 text-text-secondary">
          Free checks for syntax, disposable domains and DNS mail servers. Mail domain ready means
          the domain can receive mail; individual mailbox existence is unconfirmed. Unknown results
          block sending when send protection is enabled. Checks are cached for up to 24 hours.
        </p>
        {batches.data && <p className="mt-2 text-xs text-text-muted">Send protection: {batches.data.enabled ? 'enabled for sales email' : 'not enabled on this server'}</p>}
      </div>
      <div className="flex flex-wrap gap-2">
        <Button onClick={() => create.mutate(true)} disabled={create.isPending}>Verify lead email list</Button>
      </div>
      <label className="block space-y-2 text-xs text-text-secondary">
        <span>Or paste email addresses, separated by lines or commas</span>
        <textarea value={emails} onChange={event => setEmails(event.target.value)} rows={3}
          className="w-full rounded-md border border-border bg-background p-3 text-sm" />
      </label>
      <Button variant="secondary" disabled={create.isPending || !emails.trim()} onClick={() => create.mutate(false)}>Verify pasted addresses</Button>
      {batches.isError && <p role="status" className="text-sm text-warning">Could not load verification. Check the API connection.</p>}
      <div className="space-y-2">
        {batches.data?.jobs.map(job => <button key={job.id} onClick={() => { setSelected(job.id); setPage(1) }}
          className="flex w-full flex-wrap justify-between gap-2 rounded-md border border-border p-3 text-left text-xs">
          <span>{job.status} · {job.checked}/{job.total} checked</span>
          <span>{job.counts.ready || 0} mail domains ready · {job.counts.invalid || 0} invalid · {job.counts.unknown || 0} unknown</span>
          {job.error && <span className="w-full text-warning">{job.error}</span>}
        </button>)}
      </div>
      {selected && results.isError && <p role="status" className="text-sm text-warning">Could not load the selected batch.</p>}
      {results.data && <div className="space-y-3">
        <div className="overflow-x-auto"><table className="w-full text-left text-xs">
          <thead><tr><th className="p-2">Email</th><th className="p-2">Result</th><th className="p-2">Check</th></tr></thead>
          <tbody>{results.data.results.map(row => <tr key={row.email} className="border-t border-border">
            <td className="break-all p-2">{row.email}</td><td className="p-2">{row.status === 'ready' ? 'Mail domain ready' : row.status}</td><td className="p-2">{row.reason?.replace(/_/g, ' ')}</td>
          </tr>)}</tbody>
        </table></div>
        <div className="flex items-center gap-3">
          <Button variant="secondary" disabled={page <= 1} onClick={() => setPage(value => value - 1)}>Previous results</Button>
          <span className="text-xs">{page}/{results.data.pages}</span>
          <Button variant="secondary" disabled={page >= results.data.pages} onClick={() => setPage(value => value + 1)}>Next results</Button>
        </div>
      </div>}
    </section>
  )
}
