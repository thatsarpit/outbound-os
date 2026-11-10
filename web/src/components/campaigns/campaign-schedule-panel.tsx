import { useState } from 'react'
import { useMutation, useQueryClient } from '@tanstack/react-query'
import { CalendarClock } from 'lucide-react'
import type { Campaign } from '@/api/types'
import { campaignsApi } from '@/api/endpoints/campaigns'
import { Button, Input } from '@/components/ui'
import { toast } from '@/stores/toast-store'

export function CampaignSchedulePanel({ campaign }: { campaign: Campaign }) {
  const [time, setTime] = useState('')
  const [confirmed, setConfirmed] = useState(false)
  const [editing, setEditing] = useState(false)
  const queryClient = useQueryClient()
  const timezone = Intl.DateTimeFormat().resolvedOptions().timeZone
  const refresh = async () => {
    await Promise.all([
      queryClient.invalidateQueries({ queryKey: ['campaigns'] }),
      queryClient.invalidateQueries({ queryKey: ['campaign-detail'] }),
    ])
  }
  const schedule = useMutation({
    mutationFn: () => campaignsApi.schedule(campaign.id, new Date(time).toISOString(), timezone),
    onSuccess: async () => {
      toast.success('Campaign scheduled')
      setConfirmed(false)
      setEditing(false)
      setTime('')
      await refresh()
    },
  })
  const cancel = useMutation({
    mutationFn: () => campaignsApi.cancelSchedule(campaign.id),
    onSuccess: async () => {
      toast.success('Schedule cancelled')
      setEditing(false)
      setConfirmed(false)
      setTime('')
      await refresh()
    },
  })
  const scheduled = campaign.status === 'scheduled'
  const missed = campaign.status === 'paused' && campaign.scheduleTimezone && campaign.scheduleError && !campaign.startedAt
  if (!['draft', 'scheduled'].includes(campaign.status) && !campaign.scheduleError) return null
  const date = new Date(time)
  const validTime = Number.isFinite(date.getTime()) && date.getTime() > Date.now()
  const pending = schedule.isPending || cancel.isPending
  const error = schedule.error || cancel.error
  return (
    <section aria-labelledby="campaign-schedule-title" className="space-y-3 rounded-lg border border-border bg-surface-raised p-4">
      <h3 id="campaign-schedule-title" className="flex items-center gap-2 text-sm font-semibold text-text-primary">
        <CalendarClock aria-hidden="true" className="h-4 w-4" /> Launch schedule
      </h3>
      {campaign.scheduleError && <p role="status" className="text-sm text-danger">{campaign.scheduleError}</p>}
      {scheduled && campaign.scheduledAt && (
        <>
          <p className="text-sm text-text-primary">
            {new Intl.DateTimeFormat(undefined, { dateStyle: 'full', timeStyle: 'short', timeZone: campaign.scheduleTimezone || timezone }).format(new Date(campaign.scheduledAt))}
            {' · '}{campaign.scheduleTimezone || timezone}
          </p>
          <p className="text-xs text-text-muted">
            {campaign.scheduleTimezone
              ? 'The server checks every minute. A launch missed by more than one hour pauses for review.'
              : 'Choose a new launch time to activate this schedule.'}
          </p>
          <div className="flex flex-wrap gap-2">
            <Button variant="secondary" size="sm" disabled={pending} onClick={() => { setEditing(!editing); setConfirmed(false) }}>
              {editing ? 'Close rescheduling' : 'Reschedule'}
            </Button>
            <Button variant="secondary" size="sm" pending={cancel.isPending} disabled={pending} onClick={() => cancel.mutate()}>Cancel schedule</Button>
          </div>
        </>
      )}
      {(campaign.status === 'draft' || missed || (scheduled && editing)) && (
        <>
          <p className="text-xs text-text-muted">Schedule this populated audience. Choose daytime in the recipients’ region; this time is entered in {timezone}. Workspace sending hours also apply.</p>
          {campaign.totalLeads > 0 ? (
            <>
              <Input label="Launch date and time" type="datetime-local" value={time} disabled={pending} onChange={e => { setTime(e.target.value); setConfirmed(false) }} />
              {validTime && <p className="text-xs text-text-muted">{date.toLocaleString(undefined, { dateStyle: 'full', timeStyle: 'short' })} · {timezone}</p>}
              <label className="flex items-start gap-2 text-sm text-text-secondary">
                <input type="checkbox" className="mt-1 h-4 w-4 accent-accent" checked={confirmed} disabled={pending} onChange={e => setConfirmed(e.target.checked)} />
                I reviewed the {campaign.totalLeads} recipients, sender, template and local sending time. Scheduling authorizes this campaign to send automatically.
              </label>
              <Button size="sm" disabled={!validTime || !confirmed || pending} pending={schedule.isPending} onClick={() => schedule.mutate()}>
                {scheduled ? 'Save new launch time' : `Schedule ${campaign.totalLeads} recipients`}
              </Button>
            </>
          ) : <p className="text-sm text-text-muted">Populate and review recipients before scheduling.</p>}
        </>
      )}
      {error && <p role="alert" className="text-sm text-danger">{error.message}</p>}
    </section>
  )
}
