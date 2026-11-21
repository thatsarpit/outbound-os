import { useState } from 'react'
import { useMutation, useQueryClient } from '@tanstack/react-query'
import { CalendarClock } from 'lucide-react'
import { ApiClientError } from '@/api/client'
import type { Campaign } from '@/api/types'
import { campaignsApi } from '@/api/endpoints/campaigns'
import { Button, Input } from '@/components/ui'
import { workspaceWallTimeToUtc } from '@/lib/mobile-workspace-time'
import { useAuthStore } from '@/stores/auth-store'
import { toast } from '@/stores/toast-store'

export function CampaignSchedulePanel({
  campaign,
  review,
}: {
  campaign: Campaign
  review: { token: string; recipientCount: number } | null
}) {
  const [time, setTime] = useState('')
  const [confirmedRevision, setConfirmedRevision] = useState<string | null>(null)
  const [editing, setEditing] = useState(false)
  const isPreview = useAuthStore((state) => state.dashboardScope === 'demo')
  const queryClient = useQueryClient()
  const timezone = Intl.DateTimeFormat().resolvedOptions().timeZone
  let scheduledAt: string | null = null
  let timeError: string | null = null
  if (time) {
    try { scheduledAt = workspaceWallTimeToUtc(time, timezone) }
    catch (error) { timeError = error instanceof Error ? error.message : 'Choose a valid launch time.' }
  }
  const revision = review?.token ?? null
  const reviewedRecipientCount = review?.recipientCount ?? null
  const confirmed = revision !== null && confirmedRevision === revision
  const refresh = async () => {
    await Promise.all([
      queryClient.invalidateQueries({ queryKey: ['campaigns'] }),
      queryClient.invalidateQueries({ queryKey: ['campaign-detail'] }),
      queryClient.invalidateQueries({ queryKey: ['campaign-leads', campaign.id] }),
    ])
  }
  const schedule = useMutation({
    mutationFn: ({ token, date }: { token: string; date: string }) => campaignsApi.schedule(campaign.id, date, timezone, token),
    onError: async (error) => {
      if (error instanceof ApiClientError && error.status === 409) {
        setConfirmedRevision(null)
        await refresh()
      }
    },
    onSuccess: async () => {
      toast.success('Campaign scheduled')
      setConfirmedRevision(null)
      setEditing(false)
      setTime('')
      await refresh()
    },
  })
  const start = useMutation({
    mutationFn: (token: string) => campaignsApi.start(campaign.id, token),
    onError: async (error) => {
      if (error instanceof ApiClientError && error.status === 409) {
        setConfirmedRevision(null)
        await refresh()
      }
    },
    onSuccess: async () => {
      toast.success(isPreview ? 'Sample campaign started' : 'Campaign started')
      setConfirmedRevision(null)
      await refresh()
    },
  })
  const cancel = useMutation({
    mutationFn: () => campaignsApi.cancelSchedule(campaign.id),
    onSuccess: async () => {
      toast.success('Schedule cancelled')
      setEditing(false)
      setConfirmedRevision(null)
      setTime('')
      await refresh()
    },
  })
  const scheduled = campaign.status === 'scheduled'
  const missed = campaign.status === 'paused' && campaign.scheduleTimezone && campaign.scheduleError && !campaign.startedAt
  if (!['draft', 'scheduled', 'paused'].includes(campaign.status)) return null
  const canStart = campaign.status === 'draft' || campaign.status === 'paused'
  const canSchedule = campaign.status === 'draft' || missed || (scheduled && editing)
  const date = scheduledAt ? new Date(scheduledAt) : null
  const validTime = date !== null && date.getTime() > Date.now()
  const pending = schedule.isPending || cancel.isPending || start.isPending
  const error = schedule.error || cancel.error || start.error
  return (
    <section aria-labelledby="campaign-schedule-title" className="space-y-3 rounded-lg border border-border bg-surface-raised p-4">
      <h3 id="campaign-schedule-title" className="flex items-center gap-2 text-sm font-semibold text-text-primary">
        <CalendarClock aria-hidden="true" className="h-4 w-4" /> Campaign launch
      </h3>
      {isPreview && <p className="text-xs text-text-muted">Sample schedules reset when you reload. Messaging is disabled in this preview.</p>}
      {campaign.scheduleError && <p role="status" className="text-sm text-danger">{campaign.scheduleError}</p>}
      {scheduled && campaign.scheduledAt && (
        <>
          <p className="text-sm text-text-primary">
            {new Intl.DateTimeFormat(undefined, { dateStyle: 'full', timeStyle: 'short', timeZone: campaign.scheduleTimezone || timezone }).format(new Date(campaign.scheduledAt))}
            {' · '}{campaign.scheduleTimezone || timezone}
          </p>
          {!isPreview && (
            <p className="text-xs text-text-muted">
              {campaign.scheduleTimezone
                ? 'The server checks every minute. A launch missed by more than one hour pauses for review.'
                : 'Choose a new launch time to activate this schedule.'}
            </p>
          )}
          <div className="flex flex-wrap gap-2">
            <Button variant="secondary" size="sm" disabled={pending} onClick={() => { setEditing(!editing); setConfirmedRevision(null) }}>
              {editing ? 'Close rescheduling' : 'Reschedule'}
            </Button>
            <Button variant="secondary" size="sm" pending={cancel.isPending} disabled={pending} onClick={() => cancel.mutate()}>Cancel schedule</Button>
          </div>
        </>
      )}
      {(canStart || canSchedule) && (
        <>
          {canSchedule && <p className="text-xs text-text-muted">
            {isPreview
              ? `Choose a launch time in ${timezone} for this sample audience.`
              : `Choose daytime in the recipients’ region. Enter the launch time in ${timezone}. Workspace sending hours also apply.`}
          </p>}
          {reviewedRecipientCount === null && campaign.totalLeads > 0 && (
            <p role="status" className="text-sm text-text-muted">Load the current recipient list to review this campaign.</p>
          )}
          {review && review.recipientCount > 0 ? (
            <>
              {canSchedule && <Input label="Launch date and time" type="datetime-local" value={time} disabled={pending} onChange={e => { setTime(e.target.value); setConfirmedRevision(null) }} />}
              {canSchedule && timeError && <p role="alert" className="text-xs text-danger">{timeError}</p>}
              {canSchedule && date && validTime && <p className="text-xs text-text-muted">{date.toLocaleString(undefined, { dateStyle: 'full', timeStyle: 'short', timeZone: timezone })} · {timezone}</p>}
              <label className="flex items-start gap-2 text-sm text-text-secondary">
                <input type="checkbox" className="mt-1 h-4 w-4 accent-accent" checked={confirmed} disabled={pending} onChange={e => setConfirmedRevision(e.target.checked ? revision : null)} />
                <span>
                  I reviewed the {review.recipientCount} pending recipients, sending account, message and timing.
                </span>
              </label>
              <div className="flex flex-wrap gap-2">
                {canStart && (
                  <Button size="sm" variant="secondary" disabled={!confirmed || pending} pending={start.isPending} onClick={() => start.mutate(review.token)}>
                    {campaign.status === 'paused' ? 'Resume campaign' : 'Start now'}
                  </Button>
                )}
                {canSchedule && (
                  <Button size="sm" disabled={!validTime || !confirmed || pending} pending={schedule.isPending} onClick={() => {
                    if (scheduledAt) schedule.mutate({ token: review.token, date: scheduledAt })
                  }}>
                    {scheduled ? 'Save new launch time' : `Schedule ${review.recipientCount} ${review.recipientCount === 1 ? 'recipient' : 'recipients'}`}
                  </Button>
                )}
              </div>
            </>
          ) : (reviewedRecipientCount ?? campaign.totalLeads) === 0 && (
            <p className="text-sm text-text-muted">Prepare and review pending recipients before launching.</p>
          )}
        </>
      )}
      {error && <p role="alert" className="text-sm text-danger">{error.message}</p>}
    </section>
  )
}
