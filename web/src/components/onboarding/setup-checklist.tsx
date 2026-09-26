import { useEffect } from 'react'
import { Link, useNavigate } from 'react-router-dom'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { Check, X } from 'lucide-react'
import { onboardingApi } from '@/api/endpoints/onboarding'
import { Button } from '@/components/ui/button'
import { useAuthStore } from '@/stores/auth-store'
import { cn } from '@/lib/utils'

const FIRST_RUN_KEY = 'outboundos_setup_prompted'

/**
 * "Finish setting up" on the overview, for admins, until setup is finished or
 * dismissed. The very first time an admin lands on a workspace with no
 * business name, they are taken to the setup wizard once per browser session;
 * after that the checklist is the reminder, never a trap.
 */
export function SetupChecklist() {
  const isAdmin = useAuthStore((state) => state.user?.role === 'admin')
  const navigate = useNavigate()
  const queryClient = useQueryClient()

  const { data: status } = useQuery({
    queryKey: ['onboarding-status'],
    queryFn: () => onboardingApi.status(),
    enabled: isAdmin,
    meta: { silent: true },
  })

  useEffect(() => {
    if (!status || status.dismissed || status.steps.profile) return
    let prompted = false
    try {
      prompted = sessionStorage.getItem(FIRST_RUN_KEY) === '1'
      sessionStorage.setItem(FIRST_RUN_KEY, '1')
    } catch {
      prompted = true
    }
    if (!prompted) navigate('/setup')
  }, [status, navigate])

  const dismiss = useMutation({
    mutationFn: () => onboardingApi.dismiss(true),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ['onboarding-status'] }),
  })

  if (!isAdmin || !status || status.dismissed) return null

  const items = [
    { done: status.steps.profile, label: 'Add your business details', to: '/setup?step=business' },
    { done: status.steps.channel, label: 'Connect WhatsApp, email or another channel', to: '/setup?step=channels' },
    { done: status.steps.leadSource, label: 'Connect a lead source or import leads', to: '/setup?step=sources' },
    { done: status.steps.team, label: 'Add your team', to: '/setup?step=team' },
  ]
  const doneCount = items.filter((item) => item.done).length

  return (
    <section className="rounded-lg border border-border bg-surface p-4 sm:p-5" aria-label="Finish setting up">
      <div className="flex items-start justify-between gap-3">
        <div>
          <h2 className="text-sm font-semibold tracking-tight text-text-primary">Finish setting up</h2>
          <p className="mt-0.5 text-[12px] text-text-secondary">
            {doneCount} of {items.length} done. Leads are contacted automatically once a channel
            and a source are connected.
          </p>
        </div>
        <Button
          variant="ghost"
          size="sm"
          aria-label="Hide this checklist"
          onClick={() => dismiss.mutate()}
          disabled={dismiss.isPending}
        >
          <X className="h-4 w-4" />
        </Button>
      </div>
      <ul className="mt-3 grid gap-1 sm:grid-cols-2">
        {items.map((item) => (
          <li key={item.label}>
            <Link
              to={item.to}
              className="flex items-center gap-2.5 rounded-md px-2 py-2 text-[13px] transition-colors hover:bg-surface-raised"
            >
              <span
                className={cn(
                  'flex h-4 w-4 shrink-0 items-center justify-center rounded-full border',
                  item.done ? 'border-success bg-success text-accent-fg' : 'border-border-strong',
                )}
                aria-hidden="true"
              >
                {item.done && <Check className="h-3 w-3" />}
              </span>
              <span className={cn(item.done ? 'text-text-muted line-through' : 'text-text-primary')}>
                {item.label}
              </span>
            </Link>
          </li>
        ))}
      </ul>
    </section>
  )
}
