import { hasConfirmedOutreach } from '../../../../shared/inboxOutreach.js'
import { useState } from 'react'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { Clock3, FileText } from 'lucide-react'
import { api, ApiClientError } from '@/api/client'
import { inboxApi } from '@/api/endpoints/inbox'
import type { InboxThreadDetail } from '@/api/types'
import { Button } from '@/components/ui/button'
import { useAuthStore } from '@/stores/auth-store'
import { useOnlineStatus } from '@/hooks/use-online-status'
import { toast } from '@/stores/toast-store'

type ApprovedTemplate = {
  name: string
  language: string
  category: string
  body: string
  bodyVariables: string[]
  manualSupported?: boolean
}
function replyStatus(thread: InboxThreadDetail | null | undefined) {
  const session = thread?.whatsappSession
  if (!session) return 'unavailable'
  if (!session.accountId) return 'no_sender'
  if (session.recipientAvailable === false) return 'no_recipient'
  if (!session.lastInboundAt) return 'no_customer_message'
  const expires = session.expiresAt ? Date.parse(session.expiresAt) : NaN
  if (!Number.isFinite(expires)) return 'unavailable'
  return session.isOpen && expires > Date.now() ? 'open' : 'expired'
}

export function canSendWhatsAppFreeText(thread: InboxThreadDetail | null | undefined) {
  return replyStatus(thread) === 'open'
}

export function WhatsAppReplyWindow({ thread }: { thread: InboxThreadDetail }) {
  const session = thread.whatsappSession
  const status = replyStatus(thread)
  const templateAvailable = ['no_customer_message', 'expired', 'open'].includes(status)
  const waitingForReply = status === 'no_customer_message' && thread.messages.some(message =>
    message.channel === 'whatsapp' && message.waAccount === session?.accountId && hasConfirmedOutreach(message),
  )
  const title = {
    unavailable: 'WhatsApp reply availability unknown',
    no_sender: 'No WhatsApp sender available',
    no_recipient: 'No WhatsApp address on this lead',
    no_customer_message: waitingForReply ? 'Waiting for a WhatsApp reply' : 'No incoming WhatsApp message yet',
    expired: 'WhatsApp reply window expired',
    open: session?.expiresAt
      ? `WhatsApp replies available until ${new Date(session.expiresAt).toLocaleString([], {
          month: 'short', day: 'numeric', hour: 'numeric', minute: '2-digit',
        })}`
      : 'WhatsApp replies available',
  }[status]
  const guidance = {
    unavailable: 'Try reopening the conversation to check reply availability.',
    no_sender: 'Set up a WhatsApp sender in Integrations or choose another channel.',
    no_recipient: 'Choose another channel for this conversation.',
    no_customer_message: waitingForReply
      ? 'Free-text replies become available when the customer messages this number.'
      : 'Use an approved template to reach out. An incoming message opens free-text replies.',
    expired: 'Use an approved template to reach out again. The next incoming message reopens replies.',
    open: null,
  }[status]
  const [choosing, setChoosing] = useState(false)
  const [selection, setSelection] = useState('')
  const [values, setValues] = useState<Record<string, string>>({})
  const [requestId, setRequestId] = useState(() => crypto.randomUUID())
  const client = useQueryClient()
  const online = useOnlineStatus()
  const { user, dashboardScope } = useAuthStore()
  const canChooseTemplates = templateAvailable && Boolean(user && user.role !== 'viewer')
  const templates = useQuery({
    queryKey: ['whatsapp-templates', session?.accountId, dashboardScope],
    queryFn: () =>
      api.get<{ templates: ApprovedTemplate[] }>(
        `/whatsapp/accounts/${session?.accountId}/templates`,
      ),
    enabled: choosing && canChooseTemplates,
    staleTime: 60_000,
  })
  const rows = templates.data?.templates || []
  const template = rows.find((row) => `${row.name}:${row.language}` === selection)
  const supported =
    template &&
    template.manualSupported !== false &&
    template.bodyVariables.every((name, index) => name === String(index + 1))
  const parameters = template?.bodyVariables.map((variable) => values[variable] || '') || []
  const preview = template?.body.replace(
    /\{\{\s*(\d+)\s*\}\}/g,
    (match, number) => values[number] || match,
  )
  const send = useMutation({
    retry: false,
    mutationFn: () => {
      if (!template || !supported) throw new Error('Choose a supported approved template.')
      return inboxApi.send({
        leadId: thread.leadId,
        channel: 'whatsapp',
        accountId: session?.accountId,
        clientMessageId: requestId,
        whatsappTemplate: { name: template.name, language: template.language, parameters },
      })
    },
    onSuccess: () => {
      setRequestId(crypto.randomUUID())
      setChoosing(false)
      toast.success('WhatsApp provider accepted the template. Check the conversation for delivery updates.')
    },
    onError: (error: Error) => {
      if (error instanceof ApiClientError && error.code === 'manual_send_failed')
        setRequestId(crypto.randomUUID())
      toast.error(error.message)
    },
    onSettled: () => {
      void client.invalidateQueries({ queryKey: ['inbox-thread', thread.leadId] })
      void client.invalidateQueries({ queryKey: ['inbox-threads'] })
    },
  })
  return (
    <section
      aria-label="WhatsApp reply window"
      className={`shrink-0 border-b border-border px-3 py-2 text-xs ${status === 'expired' ? 'bg-warning-muted text-warning' : 'bg-surface text-text-secondary'}`}
    >
      <div className="flex flex-wrap items-center justify-between gap-x-2">
        <p className="flex items-center gap-1.5 py-1 font-medium">
          <Clock3 aria-hidden="true" className="h-3.5 w-3.5 shrink-0" />
          {title}
        </p>
        {canChooseTemplates && (
          <button
            type="button"
            className="inline-flex min-h-11 items-center gap-1 rounded-md px-2 font-medium underline"
            onClick={() => setChoosing(!choosing)}
            aria-expanded={choosing}
          >
            <FileText aria-hidden="true" className="h-3.5 w-3.5" />
            {choosing ? 'Close templates' : 'Approved templates'}
          </button>
        )}
      </div>
      {guidance && <p className="leading-5">{guidance}</p>}
      {choosing && canChooseTemplates && (
        <div className="mt-2 max-h-[35dvh] space-y-3 overflow-y-auto rounded-lg border border-border bg-surface p-3 text-text-primary">
          {templates.error ? (
            <Button variant="secondary" onClick={() => void templates.refetch()}>
              Retry loading templates
            </Button>
          ) : (
            <label className="block">
              Template
              <select
                className="mt-1 min-h-11 w-full rounded-md border border-border bg-surface px-2 text-base"
                value={selection}
                disabled={send.isPending}
                onChange={(event) => {
                  setSelection(event.target.value)
                  setValues({})
                  setRequestId(crypto.randomUUID())
                }}
              >
                <option value="">
                  {templates.isPending
                    ? 'Loading approved templates…'
                    : 'Choose an approved template'}
                </option>
                {rows.map((row) => (
                  <option key={`${row.name}:${row.language}`} value={`${row.name}:${row.language}`}>
                    {row.name} · {row.language} · {row.category}
                  </option>
                ))}
              </select>
            </label>
          )}
          {template && (
            <>
              {!supported ? (
                <p>
                  This template needs header, button or named-variable support. Choose another text
                  template.
                </p>
              ) : (
                <>
                  {template.bodyVariables.map((variable) => (
                    <label className="block" key={variable}>
                      Variable {variable}
                      <input
                        className="mt-1 min-h-11 w-full rounded-md border border-border bg-surface px-2 text-base"
                        value={values[variable] || ''}
                        disabled={send.isPending}
                        maxLength={1000}
                        onChange={(event) => {
                          setValues((previous) => ({ ...previous, [variable]: event.target.value }))
                          setRequestId(crypto.randomUUID())
                        }}
                      />
                    </label>
                  ))}
                  <p className="whitespace-pre-wrap rounded-md bg-surface-raised p-3 text-sm leading-6">
                    {preview}
                  </p>
                  <p className="text-xs leading-5 text-text-muted">
                    {template.category} template · Your provider may charge on delivery. The
                    customer’s next WhatsApp message opens the reply window.
                  </p>
                  <Button
                    className="min-h-11"
                    pending={send.isPending}
                    disabled={
                      !online ||
                      parameters.some((value) => !value.trim())
                    }
                    onClick={() => send.mutate()}
                  >
                    Send approved template
                  </Button>
                </>
              )}
            </>
          )}
        </div>
      )}
    </section>
  )
}
