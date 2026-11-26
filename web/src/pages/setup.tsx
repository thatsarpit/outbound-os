import { workspaceBase } from '@/lib/workspace-path'
import { useEffect, useMemo, useRef, useState, type FormEvent, type ReactNode } from 'react'
import { Link, useNavigate, useSearchParams } from 'react-router-dom'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import {
  ArrowLeft,
  ArrowRight,
  Building2,
  Check,
  Copy,
  FileSpreadsheet,
  Globe,
  Mail,
  MessageCircle,
  MessageSquare,
  Plug,
  Send,
  Users,
  Webhook,
} from 'lucide-react'
import { ApiClientError } from '@/api/client'
import { inboxApi } from '@/api/endpoints/inbox'
import {
  onboardingApi,
  onboardingStatusQuery,
  type CreatedLeadSource,
  type OnboardingStatus,
  type WorkspaceProfile,
} from '@/api/endpoints/onboarding'
import { Button } from '@/components/ui/button'
import { ErrorState } from '@/components/ui/error-state'
import { Input } from '@/components/ui/input'
import { Textarea } from '@/components/ui/textarea'
import { LoadingState } from '@/components/ui/loading-state'
import { useAuthStore } from '@/stores/auth-store'
import { toast } from '@/stores/toast-store'
import { cn } from '@/lib/utils'

const STEPS = [
  { id: 'business', label: 'Your business', icon: Building2 },
  { id: 'channels', label: 'Channels', icon: Plug },
  { id: 'sources', label: 'Lead sources', icon: Webhook },
  { id: 'team', label: 'Team', icon: Users },
] as const

type StepId = (typeof STEPS)[number]['id']
const visibleSteps = workspaceBase ? STEPS.filter(step => step.id !== 'channels') : STEPS

const OVERVIEW = '/overview?view=desktop'

export default function SetupPage() {
  const [params, setParams] = useSearchParams()
  const heading = useRef<HTMLHeadingElement>(null)
  const moveFocus = useRef(false)
  const {
    data: status,
    isPending,
    isFetching,
    isError,
    refetch,
  } = useQuery({
    ...onboardingStatusQuery,
    refetchOnMount: 'always',
  })
  const doneByStep: Record<StepId, boolean> = {
    business: Boolean(status?.steps.profile),
    channels: Boolean(status?.steps.channel),
    sources: Boolean(status?.steps.leadSource),
    team: Boolean(status?.steps.team),
  }
  const requested = visibleSteps.findIndex((item) => item.id === params.get('step'))
  const firstIncomplete = visibleSteps.findIndex((item) => !doneByStep[item.id])
  const stepIndex =
    requested >= 0 ? requested : firstIncomplete < 0 ? visibleSteps.length - 1 : firstIncomplete
  const step = visibleSteps[stepIndex]

  useEffect(() => {
    if (status && requested < 0) setParams({ step: step.id }, { replace: true })
  }, [status, requested, step.id, setParams])

  useEffect(() => {
    if (moveFocus.current) {
      heading.current?.focus()
      moveFocus.current = false
    }
  }, [step.id])

  const goTo = (index: number) => {
    const next = visibleSteps[index]
    if (!next || next.id === step.id) return
    moveFocus.current = true
    setParams({ step: next.id })
  }

  return (
    <div className="mx-auto w-full max-w-3xl animate-fade-in space-y-6">
      <header className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <p className="text-xs font-semibold text-text-muted">Workspace setup</p>
          <h1
            ref={heading}
            tabIndex={-1}
            className="mt-1 text-2xl font-semibold tracking-tight text-text-primary text-balance"
          >
            {!status
              ? 'Set up Outbound OS'
              : {
                  business: 'Tell us about your business',
                  channels: 'Connect your channels',
                  sources: 'Add a lead source',
                  team: 'Set up your team',
                }[step.id]}
          </h1>
        </div>
        <Button asChild variant="ghost" size="sm">
          <Link to={OVERVIEW}>Leave setup</Link>
        </Button>
      </header>

      {isPending && <LoadingState variant="card" label="Loading workspace setup" />}
      {isError && (
        <ErrorState
          title="Could not load setup progress"
          description="Try refreshing setup progress. Saved settings are still in your workspace."
          onRetry={() => void refetch()}
          compact
        />
      )}
      {status && (
        <>
          <ol className="grid grid-cols-2 gap-2 sm:grid-cols-4" aria-label="Setup steps">
            {visibleSteps.map((s, index) => {
              const Icon = s.icon
              const current = index === stepIndex
              const done = doneByStep[s.id]
              return (
                <li key={s.id}>
                  <button
                    type="button"
                    onClick={() => goTo(index)}
                    aria-current={current ? 'step' : undefined}
                    className={cn(
                      'flex w-full flex-col gap-2 rounded-md border px-3 py-2.5 text-left transition-colors',
                      current
                        ? 'border-accent bg-accent/8'
                        : 'border-border hover:border-border-strong hover:bg-surface-raised',
                    )}
                  >
                    <span
                      className={cn(
                        'h-1 w-full rounded-full',
                        done ? 'bg-success' : current ? 'bg-accent' : 'bg-border',
                      )}
                    />
                    <span className="flex items-center gap-1.5 text-[12px] font-medium text-text-primary">
                      {done ? (
                        <Check aria-hidden="true" className="h-3.5 w-3.5 text-success" />
                      ) : (
                        <Icon aria-hidden="true" className="h-3.5 w-3.5 text-text-muted" />
                      )}
                      <span>{s.label}</span>
                      {done && <span className="sr-only">Complete</span>}
                    </span>
                  </button>
                </li>
              )
            })}
          </ol>

          <section className="min-w-0 rounded-lg border border-border bg-surface p-5 sm:p-6">
            {step.id === 'business' && <BusinessStep onDone={() => goTo(stepIndex + 1)} />}
            {step.id === 'channels' && (
              <ChannelsStep
                channels={status.channels}
                onBack={() => goTo(stepIndex - 1)}
                onNext={() => goTo(stepIndex + 1)}
              />
            )}
            {step.id === 'sources' && (
              <SourcesStep
                counts={status.counts}
                onBack={() => goTo(stepIndex - 1)}
                onNext={() => goTo(stepIndex + 1)}
              />
            )}
            {step.id === 'team' && (
              <TeamStep
                complete={status.complete && !isError}
                checking={isFetching}
                onBack={() => goTo(stepIndex - 1)}
              />
            )}
          </section>
        </>
      )}
    </div>
  )
}

/* ── Step 1: business ─────────────────────────────────────────────────────── */

function browserTimezone(): string {
  try {
    return Intl.DateTimeFormat().resolvedOptions().timeZone || 'UTC'
  } catch {
    return 'UTC'
  }
}

function allTimezones(): string[] {
  const intl = Intl as unknown as { supportedValuesOf?: (key: string) => string[] }
  try {
    return [...new Set(['UTC', ...(intl.supportedValuesOf?.('timeZone') ?? [browserTimezone()])])]
  } catch {
    return [...new Set(['UTC', browserTimezone()])]
  }
}

const selectClass =
  'h-9 w-full rounded-md border border-border bg-surface px-2.5 text-[13px] text-text-primary focus:border-focus focus:outline-none focus:ring-3 focus:ring-focus-muted'

function BusinessStep({ onDone }: { onDone: () => void }) {
  const {
    data: saved,
    isPending,
    isError,
    refetch,
  } = useQuery({
    queryKey: ['workspace-profile'],
    queryFn: async () => {
      const profile = await onboardingApi.getProfile()
      if (!profile) throw new Error('Workspace settings are unavailable.')
      return profile
    },
    meta: { silent: true },
  })

  if (isPending) return <LoadingState variant="card" label="Loading business details" />
  if (!saved) {
    return (
      <ErrorState title="Could not load business details" onRetry={() => void refetch()} compact />
    )
  }

  return (
    <>
      {isError && (
        <ErrorState
          title="Could not refresh business details"
          onRetry={() => void refetch()}
          compact
          className="mb-5"
        />
      )}
      <BusinessForm saved={saved} onDone={onDone} />
    </>
  )
}

function BusinessForm({ saved, onDone }: { saved: WorkspaceProfile; onDone: () => void }) {
  const queryClient = useQueryClient()
  // Keep typed values when a background refresh replaces the saved profile.
  const contactDetails = useRef<HTMLDetailsElement>(null)
  const [edits, setEdits] = useState<WorkspaceProfile>({})
  const [errors, setErrors] = useState<Record<string, string>>({})
  const timezones = useMemo(allTimezones, [])
  const form = {
    BUSINESS_NAME: saved.BUSINESS_NAME || '',
    BUSINESS_WEBSITE: saved.BUSINESS_WEBSITE || '',
    BUSINESS_TIMEZONE: saved.BUSINESS_TIMEZONE || browserTimezone(),
    DEFAULT_COUNTRY_CODE: saved.DEFAULT_COUNTRY_CODE || '',
    BUSINESS_CURRENCY: saved.BUSINESS_CURRENCY || 'USD',
    BUSINESS_WHATSAPP_NUMBER: saved.BUSINESS_WHATSAPP_NUMBER || '',
    EMAIL_SIGNATURE_NAME: saved.EMAIL_SIGNATURE_NAME || '',
    ...edits,
  }

  const save = useMutation({
    mutationFn: () => onboardingApi.saveProfile(form),
    onSuccess: async (profile) => {
      if (profile) queryClient.setQueryData(['workspace-profile'], profile)
      await Promise.all([
        queryClient.invalidateQueries({ queryKey: onboardingStatusQuery.queryKey }),
        queryClient.invalidateQueries({ queryKey: ['brand'] }),
      ])
    },
    onError: (error) => {
      if (error instanceof ApiClientError && error.fields) showErrors(error.fields)
    },
    meta: { silent: true },
  })

  function showErrors(next: Record<string, string>) {
    setErrors(next)
    if (
      (next.BUSINESS_WEBSITE || next.BUSINESS_WHATSAPP_NUMBER || next.EMAIL_SIGNATURE_NAME) &&
      contactDetails.current
    ) {
      contactDetails.current.open = true
    }
  }

  function onSubmit(event: FormEvent) {
    event.preventDefault()
    save.reset()
    const next: Record<string, string> = {}
    if (!form.BUSINESS_NAME.trim()) next.BUSINESS_NAME = 'Enter your business name.'
    if (form.BUSINESS_WEBSITE && !/^https?:\/\//i.test(form.BUSINESS_WEBSITE.trim())) {
      next.BUSINESS_WEBSITE = 'Start with https://'
    }
    showErrors(next)
    if (Object.keys(next).length === 0) save.mutate(undefined, { onSuccess: onDone })
  }

  const set = (key: keyof typeof form) => (value: string) => {
    setEdits((current) => ({ ...current, [key]: value }))
    setErrors((current) => ({ ...current, [key]: '' }))
  }
  const saveError = save.error && !(save.error instanceof ApiClientError && save.error.fields)

  return (
    <form onSubmit={onSubmit} className="grid gap-5" noValidate>
      <p className="text-[13px] leading-5 text-text-secondary">
        These details appear in outreach templates and set the time zone and currency for your
        workspace.
      </p>
      <fieldset disabled={save.isPending} className="grid min-w-0 gap-4 sm:grid-cols-2">
        <Input
          label="Business name"
          required
          value={form.BUSINESS_NAME}
          onChange={(e) => set('BUSINESS_NAME')(e.target.value)}
          error={errors.BUSINESS_NAME}
        />
        <label className="flex flex-col gap-1.5">
          <span className="text-[12px] font-medium text-text-secondary">Time zone</span>
          <select
            className={selectClass}
            aria-invalid={Boolean(errors.BUSINESS_TIMEZONE) || undefined}
            aria-describedby={errors.BUSINESS_TIMEZONE ? 'setup-timezone-error' : undefined}
            value={form.BUSINESS_TIMEZONE}
            onChange={(e) => set('BUSINESS_TIMEZONE')(e.target.value)}
          >
            {!timezones.includes(form.BUSINESS_TIMEZONE) && form.BUSINESS_TIMEZONE && (
              <option value={form.BUSINESS_TIMEZONE}>{form.BUSINESS_TIMEZONE}</option>
            )}
            {timezones.map((zone) => (
              <option key={zone} value={zone}>
                {zone.replace(/_/g, ' ')}
              </option>
            ))}
          </select>
          {errors.BUSINESS_TIMEZONE && (
            <span id="setup-timezone-error" role="alert" className="text-xs text-danger">
              {errors.BUSINESS_TIMEZONE}
            </span>
          )}
        </label>
        <Input
          label="Reporting currency"
          description="Use a three-letter code such as USD, GBP or INR."
          value={form.BUSINESS_CURRENCY}
          onChange={(e) => set('BUSINESS_CURRENCY')(e.target.value.toUpperCase())}
          error={errors.BUSINESS_CURRENCY}
          maxLength={3}
        />
        <Input
          label="Home country calling code"
          description="Added to numbers typed without one. 1 = US, 44 = UK, 91 = India."
          inputMode="numeric"
          placeholder="e.g. 44"
          error={errors.DEFAULT_COUNTRY_CODE}
          value={form.DEFAULT_COUNTRY_CODE}
          onChange={(e) => set('DEFAULT_COUNTRY_CODE')(e.target.value)}
        />
        <details ref={contactDetails} className="rounded-md border border-border p-3 sm:col-span-2">
          <summary className="cursor-pointer text-sm font-medium text-text-secondary focus-visible:outline-2 focus-visible:outline-focus">
            Optional contact details
          </summary>
          <div className="mt-4 grid gap-4 sm:grid-cols-2">
            <Input
              label="Website"
              type="url"
              placeholder="https://"
              value={form.BUSINESS_WEBSITE}
              onChange={(e) => set('BUSINESS_WEBSITE')(e.target.value)}
              error={errors.BUSINESS_WEBSITE}
            />
            <Input
              label="Your WhatsApp number"
              description="Leads can tap it from your emails. Include the country code."
              inputMode="tel"
              placeholder="e.g. 447700900123"
              error={errors.BUSINESS_WHATSAPP_NUMBER}
              value={form.BUSINESS_WHATSAPP_NUMBER}
              onChange={(e) => set('BUSINESS_WHATSAPP_NUMBER')(e.target.value)}
            />
            <Input
              label="Sign emails as"
              description="Shown in outgoing emails."
              placeholder="e.g. Priya"
              error={errors.EMAIL_SIGNATURE_NAME}
              value={form.EMAIL_SIGNATURE_NAME}
              onChange={(e) => set('EMAIL_SIGNATURE_NAME')(e.target.value)}
            />
          </div>
        </details>
      </fieldset>
      {saveError && (
        <p role="alert" className="text-sm text-danger">
          {save.error instanceof ApiClientError && save.error.status < 500
            ? save.error.message
            : 'Could not save business details. Try again. Your edits are still here.'}
        </p>
      )}
      <StepFooter>
        <span />
        <Button
          type="submit"
          pending={save.isPending}
          pendingLabel="Saving…"
          rightIcon={<ArrowRight className="h-4 w-4" />}
        >
          Save and continue
        </Button>
      </StepFooter>
    </form>
  )
}

/* ── Step 2: channels ─────────────────────────────────────────────────────── */

const CHANNEL_CARDS = [
  {
    id: 'whatsapp' as const,
    name: 'WhatsApp',
    icon: MessageSquare,
    detail: 'Connect a business number for WhatsApp templates and replies.',
    to: '/integrations/whatsapp/configure',
  },
  {
    id: 'email' as const,
    name: 'Email',
    icon: Mail,
    detail: 'Any mailbox over SMTP/IMAP, or Brevo. Replies come back into the inbox.',
    to: '/integrations/email',
  },
  {
    id: 'telegram' as const,
    name: 'Telegram',
    icon: Send,
    detail: 'Your own Telegram account, for one-to-one conversations.',
    to: '/integrations/telegram',
  },
  {
    id: 'imessage' as const,
    name: 'iMessage',
    icon: MessageCircle,
    detail: 'Connect through a Mac running BlueBubbles.',
    to: '/integrations/imessage',
  },
]

function ChannelsStep({
  channels,
  onBack,
  onNext,
}: {
  channels: OnboardingStatus['channels']
  onBack: () => void
  onNext: () => void
}) {
  const connected = CHANNEL_CARDS.filter((c) => channels[c.id]).length
  const readiness = useQuery({
    queryKey: ['setup-channel-readiness'],
    queryFn: () => inboxApi.channelHealth(),
    retry: false,
    meta: { silent: true },
  })
  return (
    <div className="grid gap-5">
      <p className="text-[13px] leading-5 text-text-secondary">
        Add at least one channel. Verify it in its settings before contacting leads.
      </p>
      <div className="grid gap-3 sm:grid-cols-2">
        {CHANNEL_CARDS.map((card) => {
          const Icon = card.icon
          const isConnected = channels[card.id]
          const health = readiness.data?.[card.id]
          const check = card.id === 'email' && health
            ? ('verified' in health && Number(health.verified) > 0 ? 'Sending verified' : 'Verify sending')
            : card.id === 'whatsapp'
              ? 'Configured'
              : health?.status === 'ready' ? 'Connected' : 'Check connection'
          return (
            <div key={card.id} className="flex flex-col gap-3 rounded-md border border-border p-4">
              <div className="flex items-center justify-between gap-2">
                <span className="flex items-center gap-2 text-sm font-semibold text-text-primary">
                  <Icon aria-hidden="true" className="h-4 w-4 text-text-muted" />
                  {card.name}
                </span>
                {isConnected && (
                  <span className="inline-flex items-center gap-1 rounded-full bg-surface-raised px-2 py-0.5 text-[11px] font-medium text-text-secondary">
                    {check}
                  </span>
                )}
              </div>
              <p className="flex-1 text-[12px] leading-5 text-text-secondary">{card.detail}</p>
              {isConnected && card.id === 'whatsapp' && (
                <p className="text-xs text-text-muted">Verify a webhook receipt and a test message in WhatsApp settings.</p>
              )}
              {isConnected && card.id === 'email' && (
                <p className="text-xs text-text-muted">Check the last successful receive test in Email settings.</p>
              )}
              <Button asChild variant={isConnected ? 'secondary' : 'primary'} size="sm">
                <Link to={`${card.to}?setup=channels`}>
                  {isConnected ? `Manage ${card.name}` : `Connect ${card.name}`}
                </Link>
              </Button>
            </div>
          )
        })}
      </div>
      <StepFooter>
        <Button variant="ghost" onClick={onBack} leftIcon={<ArrowLeft className="h-4 w-4" />}>
          Back
        </Button>
        <Button onClick={onNext} rightIcon={<ArrowRight className="h-4 w-4" />}>
          {connected > 0 ? 'Continue' : 'Skip for now'}
        </Button>
      </StepFooter>
    </div>
  )
}

/* ── Step 3: lead sources ─────────────────────────────────────────────────── */

const SOURCE_CARDS = [
  {
    preset: 'website',
    name: 'Website form',
    icon: Globe,
    detail: 'Any HTML form, Webflow, WordPress or Framer form posts straight in.',
  },
  {
    preset: 'website',
    name: 'Zapier, Make or n8n',
    icon: Webhook,
    detail: 'Send leads from any app those tools connect to.',
  },
  {
    preset: 'facebook',
    name: 'Facebook Lead Ads',
    icon: Globe,
    detail: 'Instant forms from your Meta ads, via Zapier or Make.',
  },
  { preset: 'tradeindia', name: 'TradeIndia', icon: Globe, detail: 'Seller dashboard webhook.' },
  { preset: 'justdial', name: 'JustDial', icon: Globe, detail: 'JustDial lead push.' },
  {
    preset: 'engyne',
    name: 'Engyne Cloud',
    icon: Globe,
    detail: 'Admin → Webhooks. Leads arrive with phone and email.',
  },
] as const

async function copy(text: string, what: string) {
  try {
    await navigator.clipboard.writeText(text)
    toast.success(`${what} copied`)
  } catch {
    toast.error('Could not copy. Select the text and copy it manually.')
  }
}

function SourcesStep({
  counts,
  onBack,
  onNext,
}: {
  counts: OnboardingStatus['counts']
  onBack: () => void
  onNext: () => void
}) {
  const queryClient = useQueryClient()
  const [created, setCreated] = useState<{
    card: (typeof SOURCE_CARDS)[number]
    source: CreatedLeadSource
  } | null>(null)

  const create = useMutation({
    mutationFn: async (card: (typeof SOURCE_CARDS)[number]) => {
      const source = await onboardingApi.createSource(card.preset, card.name)
      if (!source?.webhookUrl || !source.apiKey) throw new Error('Missing source details')
      return source
    },
    onSuccess: (source, card) => {
      setCreated({ card, source })
      void queryClient.invalidateQueries({ queryKey: onboardingStatusQuery.queryKey })
      void queryClient.invalidateQueries({ queryKey: ['webhook-sources'] })
    },
    gcTime: 0,
    meta: { silent: true },
  })

  return (
    <div className="grid gap-5">
      <p className="text-[13px] leading-5 text-text-secondary">
        Create a source for incoming leads or import a CSV to add leads you already have.
      </p>
      {(counts.leadSources > 0 || counts.leads > 0) && (
        <p className="text-sm text-text-secondary">
          {counts.leadSources} active {counts.leadSources === 1 ? 'source' : 'sources'} ·{' '}
          {counts.leads} {counts.leads === 1 ? 'lead' : 'leads'} in this workspace
        </p>
      )}
      {create.isError && (
        <p role="alert" className="text-sm text-danger">
          {create.error instanceof ApiClientError && create.error.status < 500
            ? create.error.message
            : 'Could not confirm the new source. Check your webhook sources before trying again.'}
        </p>
      )}

      {created ? (
        <CreatedSource created={created} onAnother={() => setCreated(null)} />
      ) : (
        <div className="grid gap-3 sm:grid-cols-2">
          {SOURCE_CARDS.map((card) => {
            const Icon = card.icon
            return (
              <button
                key={card.name}
                type="button"
                onClick={() => create.mutate(card)}
                disabled={create.isPending}
                className="flex flex-col gap-1.5 rounded-md border border-border p-4 text-left transition-colors hover:border-border-strong hover:bg-surface-raised disabled:opacity-60"
              >
                <span className="flex items-center gap-2 text-sm font-semibold text-text-primary">
                  <Icon aria-hidden="true" className="h-4 w-4 text-text-muted" />
                  {card.name}
                </span>
                <span className="text-[12px] leading-5 text-text-secondary">{card.detail}</span>
              </button>
            )
          })}
          <Link
            to="/import?setup=sources"
            className="flex flex-col gap-1.5 rounded-md border border-border p-4 transition-colors hover:border-border-strong hover:bg-surface-raised"
          >
            <span className="flex items-center gap-2 text-sm font-semibold text-text-primary">
              <FileSpreadsheet aria-hidden="true" className="h-4 w-4 text-text-muted" />
              Import a spreadsheet
            </span>
            <span className="text-[12px] leading-5 text-text-secondary">
              Upload a CSV and review imported, skipped and invalid rows.
            </span>
          </Link>
        </div>
      )}

      <div>
        <Button asChild size="sm" variant="secondary">
          <Link to="/integrations/webhooks?setup=sources">Manage webhook sources</Link>
        </Button>
      </div>
      <StepFooter>
        <Button
          variant="ghost"
          onClick={onBack}
          disabled={create.isPending}
          leftIcon={<ArrowLeft className="h-4 w-4" />}
        >
          Back
        </Button>
        <Button
          onClick={onNext}
          disabled={create.isPending}
          rightIcon={<ArrowRight className="h-4 w-4" />}
        >
          {created || counts.leadSources > 0 || counts.leads > 0 ? 'Continue' : 'Skip for now'}
        </Button>
      </StepFooter>
    </div>
  )
}

function CreatedSource({
  created,
  onAnother,
}: {
  created: { card: (typeof SOURCE_CARDS)[number]; source: CreatedLeadSource }
  onAnother: () => void
}) {
  const [payload, setPayload] = useState(() => JSON.stringify({
    name: 'Setup test', email: 'setup-test@example.test', message: 'Synthetic mapping test',
  }, null, 2))
  const mapping = useMutation({
    mutationFn: async () => {
      let parsed: unknown
      try { parsed = JSON.parse(payload) } catch { throw new Error('Enter a valid JSON payload.') }
      if (!parsed || typeof parsed !== 'object' || Array.isArray(parsed)) throw new Error('Enter a JSON object.')
      return onboardingApi.testSource(created.source, parsed as Record<string, unknown>)
    },
    meta: { silent: true },
  })
  const webhook = new URL(
    created.source.webhookUrl,
    created.source.webhookOrigin || window.location.origin,
  )
  const url = webhook.href
  webhook.searchParams.set('apiKey', created.source.apiKey)
  const urlWithKey = webhook.href
  const formSnippet = `<form action="${urlWithKey}" method="post">
  <input name="name" placeholder="Your name" required>
  <input name="email" type="email" placeholder="Email">
  <input name="phone" placeholder="WhatsApp number">
  <textarea name="message" placeholder="What do you need?"></textarea>
  <label><input type="checkbox" name="email_consent" value="yes"> Email me offers and updates</label>
  <!-- Spam trap: leave hidden and empty. -->
  <input type="text" name="_gotcha" style="display:none" tabindex="-1" autocomplete="off">
  <!-- Optional: page on your site to show after sending. -->
  <input type="hidden" name="_next" value="https://your-website.com/thank-you">
  <button type="submit">Send</button>
</form>`
  const isForm = created.card.name === 'Website form'

  return (
    <div className="grid min-w-0 gap-4 rounded-md border border-success/30 bg-success-muted/30 p-4">
      <p className="flex items-center gap-2 text-sm font-semibold text-text-primary">
        <Check aria-hidden="true" className="h-4 w-4 text-success" />
        {created.source.name} created
      </p>

      <CopyRow label="Send leads to (POST, JSON or form)" value={url} what="Address" />
      <CopyRow
        label="Secret key — send as the x-api-key header"
        value={created.source.apiKey}
        what="Key"
      />
      <p className="text-[12px] leading-5 text-text-secondary">
        Save this key privately. Check how the source maps a synthetic payload before connecting your form.
      </p>

      {webhook.protocol !== 'https:' && (
        <p className="text-[12px] text-text-secondary">
          To connect an external provider, give the app a public HTTPS address and set PUBLIC_URL in
          its deployment.
        </p>
      )}
      {isForm && (
        <div className="grid gap-2">
          <p className="text-[12px] font-medium text-text-secondary">
            Paste this example into your site. A plain HTML form submits with the key in its
            address.
          </p>
          <div className="overflow-x-auto rounded-md border border-border bg-surface">
            <pre className="p-3 text-[12px] leading-5 text-text-primary">{formSnippet}</pre>
          </div>
          <div>
            <Button
              size="sm"
              variant="secondary"
              leftIcon={<Copy className="h-3.5 w-3.5" />}
              onClick={() => copy(formSnippet, 'Form')}
            >
              Copy form
            </Button>
          </div>
        </div>
      )}

      <details className="space-y-3 rounded-md border border-border bg-surface p-3">
        <summary className="cursor-pointer text-sm font-medium">Test field mapping</summary>
        <Textarea label="Synthetic JSON payload" value={payload} rows={5}
          onChange={(event) => { mapping.reset(); setPayload(event.target.value) }} disabled={mapping.isPending} />
        <Button size="sm" variant="secondary" pending={mapping.isPending} onClick={() => mapping.mutate()}>Test mapping</Button>
        {mapping.error && <p role="alert" className="text-sm text-danger">{mapping.error.message}</p>}
        {mapping.data && (
          <div role="status" className="min-w-0 space-y-1 text-xs text-text-secondary">
            <p>Mapping confirmed. Zero leads created and zero messages sent.</p>
            <pre className="overflow-x-auto rounded-md bg-surface-raised p-2">{JSON.stringify(mapping.data, null, 2)}</pre>
          </div>
        )}
      </details>

      <div>
        <Button size="sm" variant="ghost" onClick={onAnother}>
          Add another source
        </Button>
      </div>
    </div>
  )
}

function CopyRow({ label, value, what }: { label: string; value: string; what: string }) {
  return (
    <div className="grid gap-1.5">
      <span className="text-[12px] font-medium text-text-secondary">{label}</span>
      <div className="flex items-center gap-2">
        <code className="min-w-0 flex-1 overflow-x-auto whitespace-nowrap rounded-md border border-border bg-surface px-2.5 py-2 text-[12px] text-text-primary">
          {value}
        </code>
        <Button
          size="sm"
          variant="secondary"
          aria-label={`Copy ${what.toLowerCase()}`}
          onClick={() => copy(value, what)}
        >
          <Copy className="h-3.5 w-3.5" />
        </Button>
      </div>
    </div>
  )
}

/* ── Step 4: team ─────────────────────────────────────────────────────────── */

function TeamStep({
  complete,
  checking,
  onBack,
}: {
  complete: boolean
  checking: boolean
  onBack: () => void
}) {
  const navigate = useNavigate()
  const queryClient = useQueryClient()
  const provider = useAuthStore((state) => state.provider)
  const finish = useMutation({
    mutationFn: () => onboardingApi.dismiss(true),
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: onboardingStatusQuery.queryKey })
      toast.success('Setup complete.')
    },
    meta: { silent: true },
  })

  return (
    <div className="grid gap-5">
      <p className="text-[13px] leading-5 text-text-secondary">
        Adding teammates is optional.{' '}
        {provider === 'clerk'
          ? 'Invite members to your Clerk organization and assign their workspace roles.'
          : 'Create an account and choose a role for each teammate in Team.'}
      </p>
      <div>
        <Button asChild variant="secondary">
          <Link to="/team?setup=team" className="gap-2">
            <Users aria-hidden="true" className="h-4 w-4" />
            Add teammates
          </Link>
        </Button>
      </div>
      {!complete && !checking && (
        <p className="text-sm text-text-secondary">
          You can leave now and return from the overview checklist to finish the core steps.
        </p>
      )}
      {finish.isError && (
        <p role="alert" className="text-sm text-danger">
          Could not finish setup. Your settings are saved. Try again.
        </p>
      )}
      <StepFooter>
        <Button
          variant="ghost"
          onClick={onBack}
          disabled={finish.isPending}
          leftIcon={<ArrowLeft className="h-4 w-4" />}
        >
          Back
        </Button>
        {complete ? (
          <Button
            onClick={() =>
              finish.mutate(undefined, { onSuccess: () => navigate(OVERVIEW, { replace: true }) })
            }
            pending={finish.isPending || checking}
            pendingLabel={finish.isPending ? 'Finishing…' : 'Checking progress…'}
          >
            Finish setup
          </Button>
        ) : (
          <Button asChild>
            <Link to={OVERVIEW}>Return to overview</Link>
          </Button>
        )}
      </StepFooter>
    </div>
  )
}

function StepFooter({ children }: { children: ReactNode }) {
  return (
    <div className="flex items-center justify-between gap-3 border-t border-border-subtle pt-4">
      {children}
    </div>
  )
}
