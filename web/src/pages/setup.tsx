import { useEffect, useMemo, useState, type FormEvent, type ReactNode } from 'react'
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
import { onboardingApi, type CreatedLeadSource } from '@/api/endpoints/onboarding'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { toast } from '@/stores/toast-store'
import { cn } from '@/lib/utils'

/**
 * First-run setup. Four short steps, each skippable, in the order that gets a
 * new workspace to its first contacted lead: say who you are, connect a way to
 * reach people, connect a way for leads to arrive, bring your team.
 *
 * Nothing here is a separate configuration system — every step writes to the
 * same settings the rest of the app uses, and links out to the full pages for
 * anything longer than a form.
 */

const STEPS = [
  { id: 'business', label: 'Your business', icon: Building2 },
  { id: 'channels', label: 'Channels', icon: Plug },
  { id: 'sources', label: 'Lead sources', icon: Webhook },
  { id: 'team', label: 'Team', icon: Users },
] as const

type StepId = (typeof STEPS)[number]['id']

export default function SetupPage() {
  const [params, setParams] = useSearchParams()
  const requested = params.get('step') as StepId | null
  const stepIndex = Math.max(0, STEPS.findIndex((s) => s.id === requested))
  const step = STEPS[stepIndex]

  const { data: status } = useQuery({
    queryKey: ['onboarding-status'],
    queryFn: () => onboardingApi.status(),
  })

  const goTo = (index: number) => {
    const next = STEPS[Math.min(STEPS.length - 1, Math.max(0, index))]
    setParams({ step: next.id }, { replace: false })
    window.scrollTo({ top: 0 })
  }

  const doneByStep: Record<StepId, boolean> = {
    business: Boolean(status?.steps.profile),
    channels: Boolean(status?.steps.channel),
    sources: Boolean(status?.steps.leadSource),
    team: Boolean(status?.steps.team),
  }

  return (
    <div className="mx-auto w-full max-w-3xl animate-fade-in space-y-6">
      <header>
        <p className="text-[11px] font-semibold uppercase tracking-[0.14em] text-text-muted">
          Set up Outbound OS
        </p>
        <h1 className="mt-1 text-2xl font-semibold tracking-tight text-text-primary text-balance">
          {step.id === 'business' && 'Tell us about your business'}
          {step.id === 'channels' && 'How do you want to reach people?'}
          {step.id === 'sources' && 'Where do your leads come from?'}
          {step.id === 'team' && 'Who else works leads with you?'}
        </h1>
      </header>

      <ol className="grid grid-cols-4 gap-2" aria-label="Setup steps">
        {STEPS.map((s, index) => {
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
                  <span className="truncate">{s.label}</span>
                </span>
              </button>
            </li>
          )
        })}
      </ol>

      <section className="rounded-lg border border-border bg-surface p-5 sm:p-6">
        {step.id === 'business' && <BusinessStep onDone={() => goTo(stepIndex + 1)} />}
        {step.id === 'channels' && (
          <ChannelsStep channels={status?.channels} onBack={() => goTo(stepIndex - 1)} onNext={() => goTo(stepIndex + 1)} />
        )}
        {step.id === 'sources' && (
          <SourcesStep onBack={() => goTo(stepIndex - 1)} onNext={() => goTo(stepIndex + 1)} />
        )}
        {step.id === 'team' && <TeamStep onBack={() => goTo(stepIndex - 1)} />}
      </section>
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
    return intl.supportedValuesOf?.('timeZone') ?? ['UTC']
  } catch {
    return ['UTC']
  }
}

const selectClass =
  'h-9 w-full rounded-md border border-border bg-surface px-2.5 text-[13px] text-text-primary focus:border-focus focus:outline-none focus:ring-3 focus:ring-focus-muted'

function BusinessStep({ onDone }: { onDone: () => void }) {
  const queryClient = useQueryClient()
  const { data: saved, isLoading } = useQuery({
    queryKey: ['workspace-profile'],
    queryFn: () => onboardingApi.getProfile(),
  })
  const [form, setForm] = useState({
    BUSINESS_NAME: '',
    BUSINESS_WEBSITE: '',
    BUSINESS_TIMEZONE: '',
    DEFAULT_COUNTRY_CODE: '',
    BUSINESS_WHATSAPP_NUMBER: '',
    EMAIL_SIGNATURE_NAME: '',
  })
  const [errors, setErrors] = useState<Record<string, string>>({})
  const timezones = useMemo(allTimezones, [])

  useEffect(() => {
    if (!saved) return
    setForm({
      BUSINESS_NAME: saved.BUSINESS_NAME && saved.BUSINESS_NAME !== 'Outbound OS' ? saved.BUSINESS_NAME : '',
      BUSINESS_WEBSITE: saved.BUSINESS_WEBSITE || '',
      // A fresh install says UTC; the person setting it up almost certainly
      // is not, so start from their browser's zone.
      BUSINESS_TIMEZONE:
        saved.BUSINESS_TIMEZONE && saved.BUSINESS_TIMEZONE !== 'UTC'
          ? saved.BUSINESS_TIMEZONE
          : browserTimezone(),
      DEFAULT_COUNTRY_CODE: saved.DEFAULT_COUNTRY_CODE || '',
      BUSINESS_WHATSAPP_NUMBER: saved.BUSINESS_WHATSAPP_NUMBER || '',
      EMAIL_SIGNATURE_NAME: saved.EMAIL_SIGNATURE_NAME || '',
    })
  }, [saved])

  const save = useMutation({
    mutationFn: () => onboardingApi.saveProfile(form),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['workspace-profile'] })
      queryClient.invalidateQueries({ queryKey: ['onboarding-status'] })
      queryClient.invalidateQueries({ queryKey: ['brand'] })
      onDone()
    },
    onError: (error: Error) => toast.error(error.message),
    meta: { silent: true },
  })

  function onSubmit(event: FormEvent) {
    event.preventDefault()
    const next: Record<string, string> = {}
    if (!form.BUSINESS_NAME.trim()) next.BUSINESS_NAME = 'Your business name goes on every message.'
    if (form.BUSINESS_WEBSITE && !/^https?:\/\//i.test(form.BUSINESS_WEBSITE.trim())) {
      next.BUSINESS_WEBSITE = 'Start with https://'
    }
    setErrors(next)
    if (Object.keys(next).length === 0) save.mutate()
  }

  const set = (key: keyof typeof form) => (value: string) => setForm((f) => ({ ...f, [key]: value }))

  return (
    <form onSubmit={onSubmit} className="grid gap-5" noValidate>
      <p className="text-[13px] leading-5 text-text-secondary">
        This is how you introduce yourself in WhatsApp templates and emails, and when your day
        starts for sending limits and reports. You can change any of it later in Settings.
      </p>
      <div className="grid gap-4 sm:grid-cols-2">
        <Input
          label="Business name"
          required
          value={form.BUSINESS_NAME}
          onChange={(e) => set('BUSINESS_NAME')(e.target.value)}
          error={errors.BUSINESS_NAME}
          disabled={isLoading}
          autoFocus
        />
        <Input
          label="Website"
          type="url"
          placeholder="https://"
          value={form.BUSINESS_WEBSITE}
          onChange={(e) => set('BUSINESS_WEBSITE')(e.target.value)}
          error={errors.BUSINESS_WEBSITE}
        />
        <label className="flex flex-col gap-1.5">
          <span className="text-[12px] font-medium text-text-secondary">Time zone</span>
          <select
            className={selectClass}
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
        </label>
        <Input
          label="Home country calling code"
          description="Added to numbers typed without one. 1 = US, 44 = UK, 91 = India."
          inputMode="numeric"
          placeholder="e.g. 44"
          value={form.DEFAULT_COUNTRY_CODE}
          onChange={(e) => set('DEFAULT_COUNTRY_CODE')(e.target.value)}
        />
        <Input
          label="Your WhatsApp number"
          description="Leads can tap it from your emails. Include the country code."
          inputMode="tel"
          placeholder="e.g. 447700900123"
          value={form.BUSINESS_WHATSAPP_NUMBER}
          onChange={(e) => set('BUSINESS_WHATSAPP_NUMBER')(e.target.value)}
        />
        <Input
          label="Sign emails as"
          description="A person's name reads better than a company."
          placeholder="e.g. Priya"
          value={form.EMAIL_SIGNATURE_NAME}
          onChange={(e) => set('EMAIL_SIGNATURE_NAME')(e.target.value)}
        />
      </div>
      <StepFooter>
        <span />
        <Button type="submit" pending={save.isPending} pendingLabel="Saving…" rightIcon={<ArrowRight className="h-4 w-4" />}>
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
    detail: 'Official Meta Cloud API (free to set up) or AiSensy. Where most B2B buyers reply fastest.',
    to: '/settings/whatsapp',
  },
  {
    id: 'email' as const,
    name: 'Email',
    icon: Mail,
    detail: 'Any mailbox over SMTP/IMAP, or Brevo. Replies come back into the inbox.',
    to: '/settings/email',
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
    detail: 'Through a Mac running BlueBubbles. Useful for US and UK buyers.',
    to: '/settings/imessage',
  },
]

function ChannelsStep({
  channels,
  onBack,
  onNext,
}: {
  channels?: Record<'whatsapp' | 'email' | 'telegram' | 'imessage', boolean>
  onBack: () => void
  onNext: () => void
}) {
  const connected = CHANNEL_CARDS.filter((c) => channels?.[c.id]).length
  return (
    <div className="grid gap-5">
      <p className="text-[13px] leading-5 text-text-secondary">
        Connect one or more. A new lead is contacted on every connected channel the moment it
        arrives. Each opens its own settings page; come back here when you are done.
      </p>
      <div className="grid gap-3 sm:grid-cols-2">
        {CHANNEL_CARDS.map((card) => {
          const Icon = card.icon
          const isConnected = Boolean(channels?.[card.id])
          return (
            <div key={card.id} className="flex flex-col gap-3 rounded-md border border-border p-4">
              <div className="flex items-center justify-between gap-2">
                <span className="flex items-center gap-2 text-sm font-semibold text-text-primary">
                  <Icon aria-hidden="true" className="h-4 w-4 text-text-muted" />
                  {card.name}
                </span>
                {isConnected && (
                  <span className="inline-flex items-center gap-1 rounded-full bg-success-muted px-2 py-0.5 text-[11px] font-medium text-success">
                    <Check aria-hidden="true" className="h-3 w-3" /> Connected
                  </span>
                )}
              </div>
              <p className="flex-1 text-[12px] leading-5 text-text-secondary">{card.detail}</p>
              <Button asChild variant={isConnected ? 'secondary' : 'primary'} size="sm">
                <Link to={card.to}>{isConnected ? 'Manage' : `Connect ${card.name}`}</Link>
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
  { preset: 'website', name: 'Website form', icon: Globe, detail: 'Any HTML form, Webflow, WordPress or Framer form posts straight in.' },
  { preset: 'website', name: 'Zapier, Make or n8n', label: 'Automation', icon: Webhook, detail: 'Send leads from any app those tools connect to.' },
  { preset: 'facebook', name: 'Facebook Lead Ads', icon: Globe, detail: 'Instant forms from your Meta ads, via Zapier or Make.' },
  { preset: 'indiamart', name: 'IndiaMART', icon: Globe, detail: 'Lead Manager → CRM Integration → Webhook URL.' },
  { preset: 'tradeindia', name: 'TradeIndia', icon: Globe, detail: 'Seller dashboard webhook.' },
  { preset: 'justdial', name: 'JustDial', icon: Globe, detail: 'JustDial lead push.' },
  { preset: 'engyne', name: 'Engyne Cloud', icon: Globe, detail: 'Admin → Webhooks. Leads arrive with phone and email.' },
] as const

function copy(text: string, what: string) {
  navigator.clipboard
    .writeText(text)
    .then(() => toast.success(`${what} copied`))
    .catch(() => toast.error('Copy failed — select the text and copy it instead'))
}

function SourcesStep({ onBack, onNext }: { onBack: () => void; onNext: () => void }) {
  const queryClient = useQueryClient()
  const [created, setCreated] = useState<{ card: (typeof SOURCE_CARDS)[number]; source: CreatedLeadSource } | null>(null)

  const create = useMutation({
    mutationFn: (card: (typeof SOURCE_CARDS)[number]) => onboardingApi.createSource(card.preset, card.name),
    onSuccess: (source, card) => {
      if (source) setCreated({ card, source })
      queryClient.invalidateQueries({ queryKey: ['onboarding-status'] })
      queryClient.invalidateQueries({ queryKey: ['webhook-sources'] })
    },
    onError: (error: Error) => toast.error(error.message),
    meta: { silent: true },
  })

  const origin = typeof window === 'undefined' ? '' : window.location.origin

  return (
    <div className="grid gap-5">
      <p className="text-[13px] leading-5 text-text-secondary">
        Each source gets its own web address to send leads to. Pick one to create it; you can
        add more any time under Integrations → Webhooks.
      </p>

      {created ? (
        <CreatedSource created={created} origin={origin} onAnother={() => setCreated(null)} />
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
            to="/import"
            className="flex flex-col gap-1.5 rounded-md border border-border p-4 transition-colors hover:border-border-strong hover:bg-surface-raised"
          >
            <span className="flex items-center gap-2 text-sm font-semibold text-text-primary">
              <FileSpreadsheet aria-hidden="true" className="h-4 w-4 text-text-muted" />
              Import a spreadsheet
            </span>
            <span className="text-[12px] leading-5 text-text-secondary">
              CSV from another CRM or an export. Duplicates are merged, not doubled.
            </span>
          </Link>
        </div>
      )}

      <StepFooter>
        <Button variant="ghost" onClick={onBack} leftIcon={<ArrowLeft className="h-4 w-4" />}>
          Back
        </Button>
        <Button onClick={onNext} rightIcon={<ArrowRight className="h-4 w-4" />}>
          {created ? 'Continue' : 'Skip for now'}
        </Button>
      </StepFooter>
    </div>
  )
}

function CreatedSource({
  created,
  origin,
  onAnother,
}: {
  created: { card: (typeof SOURCE_CARDS)[number]; source: CreatedLeadSource }
  origin: string
  onAnother: () => void
}) {
  const url = `${origin}${created.source.webhookUrl}`
  const urlWithKey = `${url}?apiKey=${created.source.apiKey}`
  const formSnippet = `<form action="${urlWithKey}" method="post">
  <input name="name" placeholder="Your name" required>
  <input name="email" type="email" placeholder="Email">
  <input name="phone" placeholder="WhatsApp number">
  <textarea name="message" placeholder="What do you need?"></textarea>
  <label><input type="checkbox" name="email_consent" value="yes"> Email me offers and updates</label>
  <button type="submit">Send</button>
</form>`
  const isForm = created.card.name === 'Website form'

  return (
    <div className="grid gap-4 rounded-md border border-success/30 bg-success-muted/30 p-4">
      <p className="flex items-center gap-2 text-sm font-semibold text-text-primary">
        <Check aria-hidden="true" className="h-4 w-4 text-success" />
        {created.source.name} is ready
      </p>

      <CopyRow label="Send leads to (POST, JSON or form)" value={url} what="Address" />
      <CopyRow label="Secret key — send as the x-api-key header" value={created.source.apiKey} what="Key" />
      <p className="text-[12px] leading-5 text-text-secondary">
        The key is shown only now; you can make a new one later under Integrations → Webhooks. It
        only allows sending leads into this source.
      </p>

      {isForm && (
        <div className="grid gap-2">
          <p className="text-[12px] font-medium text-text-secondary">
            Paste into your site. Browsers cannot set headers, so a plain form carries the key in
            its address:
          </p>
          <div className="overflow-x-auto rounded-md border border-border bg-surface">
            <pre className="p-3 text-[12px] leading-5 text-text-primary">{formSnippet}</pre>
          </div>
          <div>
            <Button size="sm" variant="secondary" leftIcon={<Copy className="h-3.5 w-3.5" />} onClick={() => copy(formSnippet, 'Form')}>
              Copy form
            </Button>
          </div>
        </div>
      )}

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
        <Button size="sm" variant="secondary" aria-label={`Copy ${what.toLowerCase()}`} onClick={() => copy(value, what)}>
          <Copy className="h-3.5 w-3.5" />
        </Button>
      </div>
    </div>
  )
}

/* ── Step 4: team ─────────────────────────────────────────────────────────── */

function TeamStep({ onBack }: { onBack: () => void }) {
  const navigate = useNavigate()
  const queryClient = useQueryClient()
  const finish = useMutation({
    mutationFn: () => onboardingApi.dismiss(true),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['onboarding-status'] })
      toast.success('You are set up. New leads will be contacted as they arrive.')
      navigate('/overview')
    },
    onError: (error: Error) => toast.error(error.message),
    meta: { silent: true },
  })

  return (
    <div className="grid gap-5">
      <p className="text-[13px] leading-5 text-text-secondary">
        Add the people who will reply to leads. Agents see the inbox and their leads; managers
        also run campaigns and imports; admins manage settings. Everyone signs in with their
        email and a password you set — they can change it under Account.
      </p>
      <div>
        <Button asChild variant="secondary">
          <Link to="/team" className="gap-2">
            <Users aria-hidden="true" className="h-4 w-4" />
            Add teammates
          </Link>
        </Button>
      </div>
      <StepFooter>
        <Button variant="ghost" onClick={onBack} leftIcon={<ArrowLeft className="h-4 w-4" />}>
          Back
        </Button>
        <Button onClick={() => finish.mutate()} pending={finish.isPending} pendingLabel="Finishing…">
          Finish setup
        </Button>
      </StepFooter>
    </div>
  )
}

function StepFooter({ children }: { children: ReactNode }) {
  return <div className="flex items-center justify-between gap-3 border-t border-border-subtle pt-4">{children}</div>
}
