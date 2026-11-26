import { Link } from 'react-router-dom'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { Check, X } from 'lucide-react'
import { onboardingApi, onboardingStatusQuery } from '@/api/endpoints/onboarding'
import { Button } from '@/components/ui/button'
import { useAuthStore } from '@/stores/auth-store'
import { cn } from '@/lib/utils'

/** A reminder for admins who leave setup with core steps unfinished. */
export function SetupChecklist() {
  const canSetUp = useAuthStore(
    (state) => state.user?.role === 'admin' && state.hasCapability('page.settings'),
  )
  const queryClient = useQueryClient()
  const { data: status } = useQuery({ ...onboardingStatusQuery, enabled: canSetUp })

  const dismiss = useMutation({
    mutationFn: () => onboardingApi.dismiss(true),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: onboardingStatusQuery.queryKey }),
  })

  if (!canSetUp || !status || status.dismissed || status.complete) return null

  const items = [
    { done: status.steps.profile, label: 'Add your business details', to: '/setup?step=business' },
    {
      done: status.steps.channel,
      label: 'Connect WhatsApp, email or another channel',
      to: '/setup?step=channels',
    },
    {
      done: status.steps.leadSource,
      label: 'Connect a lead source or import leads',
      to: '/setup?step=sources',
    },
    { done: status.steps.team, label: 'Add your team (optional)', to: '/setup?step=team' },
  ]
  const requiredDone = items.slice(0, 3).filter((item) => item.done).length

  return (
    <section
      className="rounded-lg border border-border bg-surface p-4 sm:p-5"
      aria-label="Finish setting up"
    >
      <div className="flex items-start justify-between gap-3">
        <div>
          <h2 className="text-sm font-semibold tracking-tight text-text-primary">
            Finish setting up
          </h2>
          <p className="mt-0.5 text-[12px] text-text-secondary">
            {requiredDone} of 3 core steps complete. You can pick up where you left off.
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
              <span
                className={cn(item.done ? 'text-text-muted line-through' : 'text-text-primary')}
              >
                {item.label}
              </span>
            </Link>
          </li>
        ))}
      </ul>
    </section>
  )
}
