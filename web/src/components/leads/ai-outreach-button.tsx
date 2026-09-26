import { useState } from 'react'
import { useQueryClient } from '@tanstack/react-query'
import { PenLine, Send, RefreshCw, Loader2, Repeat, MessageCircle, Mail } from 'lucide-react'
import { leadsApi, type AiOutreachDraft, type AiEmailDraft } from '@/api/endpoints/leads'
import { invalidateLeadSurfaceQueries } from '@/lib/lead-automation'
import { toast } from '@/stores/toast-store'
import {
  Button,
  Input,
  Textarea,
  CheckboxField,
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
  DialogBody,
  DialogFooter,
} from '@/components/ui'

interface AiOutreachButtonProps {
  leadId: number
  leadName?: string
  leadMobile?: string | null
  leadEmail?: string | null
  variant?: 'primary' | 'secondary' | 'ghost'
  size?: 'sm' | 'md' | 'lg'
  iconOnly?: boolean
  label?: string
  className?: string
  onSent?: () => void
}

const esc = (s: string) => s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')

/**
 * Turn the edited plain-text body into the HTML the mailer expects: blank-line
 * separated blocks become <p>, and a block whose lines all start with a bullet
 * marker becomes a <ul>. This is what keeps the sent email properly formatted.
 */
function htmlFromText(text: string): string {
  return text
    .split(/\n{2,}/)
    .map((b) => b.trim())
    .filter(Boolean)
    .map((block) => {
      const lines = block
        .split('\n')
        .map((l) => l.trim())
        .filter(Boolean)
      const isList = lines.length > 1 && lines.every((l) => /^[-•*]\s+/.test(l))
      if (isList) {
        return `<ul>${lines.map((l) => `<li>${esc(l.replace(/^[-•*]\s+/, ''))}</li>`).join('')}</ul>`
      }
      return `<p>${lines.map(esc).join('<br>')}</p>`
    })
    .join('\n')
}

/** Convert the drafted HTML into editable plain text, preserving paragraph
 * breaks (blank lines) and list items (as "- " lines). */
function draftHtmlToText(html: string): string {
  return html
    .replace(/<li[^>]*>/gi, '- ')
    .replace(/<\/li>/gi, '\n')
    .replace(/<\/(p|ul|ol)>/gi, '\n\n')
    .replace(/<br\s*\/?>/gi, '\n')
    .replace(/<[^>]+>/g, '')
    .replace(/&nbsp;/gi, ' ')
    .replace(/&amp;/gi, '&')
    .replace(/&lt;/gi, '<')
    .replace(/&gt;/gi, '>')
    .replace(/\n{3,}/g, '\n\n')
    .replace(/[ \t]+\n/g, '\n')
    .trim()
}

/**
 * First-touch outreach for a lead across WhatsApp + Email. One click drafts both
 * available channels (WhatsApp via round-robin sender, Email via the lead's
 * verified sender), the operator reviews/edits, and a single Send fires every
 * checked channel. Nothing reaches the customer until Send.
 */
export function AiOutreachButton({
  leadId,
  leadName,
  leadMobile,
  leadEmail,
  variant = 'secondary',
  size = 'sm',
  iconOnly = false,
  label = 'Draft outreach',
  className,
  onSent,
}: AiOutreachButtonProps) {
  const queryClient = useQueryClient()
  const hasWhatsApp = !!leadMobile?.trim()
  const hasEmail = !!leadEmail?.trim()

  const [open, setOpen] = useState(false)
  const [opening, setOpening] = useState(false)
  const [sending, setSending] = useState(false)

  // WhatsApp channel state
  const [waOn, setWaOn] = useState(false)
  const [waDraft, setWaDraft] = useState<AiOutreachDraft | null>(null)
  const [waText, setWaText] = useState('')
  const [waLoading, setWaLoading] = useState(false)
  const [waError, setWaError] = useState<string | null>(null)

  // Email channel state
  const [emailOn, setEmailOn] = useState(false)
  const [emailDraft, setEmailDraft] = useState<AiEmailDraft | null>(null)
  const [emailSubject, setEmailSubject] = useState('')
  const [emailText, setEmailText] = useState('')
  const [emailLoading, setEmailLoading] = useState(false)
  const [emailError, setEmailError] = useState<string | null>(null)

  const drafting = waLoading || emailLoading

  async function draftWhatsApp() {
    setWaLoading(true)
    setWaError(null)
    try {
      const d = await leadsApi.draftAiOutreach(leadId)
      if (!d) throw new Error('empty response')
      setWaDraft(d)
      setWaText(d.message)
    } catch (e) {
      setWaError((e as Error).message)
      setWaOn(false)
    } finally {
      setWaLoading(false)
    }
  }

  async function draftEmail() {
    setEmailLoading(true)
    setEmailError(null)
    try {
      const d = await leadsApi.draftAiEmail(leadId)
      if (!d) throw new Error('empty response')
      setEmailDraft(d)
      setEmailSubject(d.subject)
      setEmailText(d.htmlBody ? draftHtmlToText(d.htmlBody) : d.body || '')
    } catch (e) {
      setEmailError((e as Error).message)
      setEmailOn(false)
    } finally {
      setEmailLoading(false)
    }
  }

  async function openAndDraft() {
    setOpening(true)
    setWaOn(hasWhatsApp)
    setEmailOn(hasEmail)
    setWaDraft(null)
    setEmailDraft(null)
    setWaError(null)
    setEmailError(null)
    setOpen(true)
    await Promise.allSettled([
      hasWhatsApp ? draftWhatsApp() : Promise.resolve(),
      hasEmail ? draftEmail() : Promise.resolve(),
    ])
    setOpening(false)
  }

  async function regenerate() {
    await Promise.allSettled([
      waOn ? draftWhatsApp() : Promise.resolve(),
      emailOn ? draftEmail() : Promise.resolve(),
    ])
  }

  const canSend =
    !sending &&
    !drafting &&
    ((waOn && !!waText.trim() && !!waDraft) || (emailOn && !!emailText.trim() && !!emailDraft))

  async function doSend() {
    setSending(true)
    const results: string[] = []
    const failures: string[] = []

    const tasks: Promise<void>[] = []

    if (waOn && waDraft && waText.trim()) {
      tasks.push(
        leadsApi
          .sendWhatsApp(leadId, waText.trim(), waDraft.accountId)
          .then((r) => {
            if (r && r.success) results.push('WhatsApp')
            else failures.push(`WhatsApp${r?.reason ? ` (${r.reason})` : ''}`)
          })
          .catch((e: Error) => {
            failures.push(`WhatsApp (${e.message})`)
          }),
      )
    }

    if (emailOn && emailDraft && emailText.trim()) {
      tasks.push(
        leadsApi
          .sendEmail(leadId, {
            subject: emailSubject.trim(),
            body: emailText.trim(),
            htmlBody: htmlFromText(emailText),
            accountId: emailDraft.accountId,
          })
          .then((r) => {
            if (r && r.success) results.push('Email')
            else failures.push(`Email${r?.error ? ` (${r.error})` : ''}`)
          })
          .catch((e: Error) => {
            failures.push(`Email (${e.message})`)
          }),
      )
    }

    await Promise.all(tasks)
    setSending(false)

    if (results.length > 0) {
      invalidateLeadSurfaceQueries(queryClient)
      void queryClient.invalidateQueries({ queryKey: ['lead-thread', leadId] })
      void queryClient.invalidateQueries({ queryKey: ['inbox-thread', leadId] })
      toast.success(
        `Sent via ${results.join(' + ')}${failures.length ? ` · failed: ${failures.join(', ')}` : ''}`,
      )
      onSent?.()
    }
    if (failures.length > 0 && results.length === 0) {
      toast.error(`Send failed: ${failures.join(', ')}`)
      return
    }
    setOpen(false)
  }

  const triggerDisabled = (!hasWhatsApp && !hasEmail) || opening

  return (
    <>
      <Button
        variant={variant}
        size={size}
        disabled={triggerDisabled}
        className={className}
        title={
          iconOnly ? label : !hasWhatsApp && !hasEmail ? 'No phone or email on file' : undefined
        }
        aria-label={iconOnly ? label : undefined}
        onClick={(e) => {
          e.stopPropagation()
          void openAndDraft()
        }}
      >
        {opening ? (
          <Loader2 className="h-4 w-4 animate-spin" aria-hidden="true" />
        ) : (
          <PenLine className="h-4 w-4" aria-hidden="true" />
        )}
        {!iconOnly && <span className="ml-1.5">{label}</span>}
      </Button>

      <Dialog open={open} onOpenChange={(v) => !sending && setOpen(v)}>
        <DialogContent size="xl" onClick={(e) => e.stopPropagation()}>
          <DialogHeader>
            <DialogTitle>Draft outreach{leadName ? ` — ${leadName}` : ''}</DialogTitle>
            <DialogDescription>
              Pick the channels, review the drafts, then send. Nothing goes out until you click
              Send.
            </DialogDescription>
          </DialogHeader>

          <DialogBody className="space-y-4">
            {/* WhatsApp */}
            {hasWhatsApp && (
              <div className="rounded-md border border-border p-3">
                <div className="flex items-center justify-between gap-2">
                  <CheckboxField
                    label="WhatsApp"
                    description={
                      waLoading
                        ? 'Drafting…'
                        : waError
                          ? `Couldn't draft: ${waError}`
                          : waDraft
                            ? `from ${waDraft.accountName}${waDraft.accountPhone ? ` (${waDraft.accountPhone})` : ''}`
                            : ''
                    }
                    checked={waOn}
                    disabled={waLoading || sending || !!waError}
                    onCheckedChange={(v) => setWaOn(v === true)}
                  />
                  <MessageCircle className="h-4 w-4 shrink-0 text-text-muted" aria-hidden="true" />
                </div>
                {waOn && (
                  <>
                    <Textarea
                      className="mt-3"
                      value={waText}
                      onChange={(e) => setWaText(e.target.value)}
                      rows={5}
                      placeholder={waLoading ? 'Drafting…' : 'WhatsApp message…'}
                      disabled={waLoading || sending}
                    />
                    <p className="mt-1 flex items-center gap-1 text-xs text-text-muted">
                      <Repeat className="h-3 w-3" aria-hidden="true" />
                      round-robin — the next lead rotates to another number
                    </p>
                  </>
                )}
              </div>
            )}

            {/* Email */}
            {hasEmail ? (
              <div className="rounded-md border border-border p-3">
                <div className="flex items-center justify-between gap-2">
                  <CheckboxField
                    label="Email"
                    description={
                      emailLoading
                        ? 'Drafting…'
                        : emailError
                          ? `Couldn't draft: ${emailError}`
                          : emailDraft
                            ? `from ${emailDraft.senderName}${emailDraft.senderEmail ? ` <${emailDraft.senderEmail}>` : ''}`
                            : ''
                    }
                    checked={emailOn}
                    disabled={emailLoading || sending || !!emailError}
                    onCheckedChange={(v) => setEmailOn(v === true)}
                  />
                  <Mail className="h-4 w-4 shrink-0 text-text-muted" aria-hidden="true" />
                </div>
                {emailOn && (
                  <div className="mt-3 space-y-2">
                    <Input
                      value={emailSubject}
                      onChange={(e) => setEmailSubject(e.target.value)}
                      placeholder={emailLoading ? 'Drafting…' : 'Subject'}
                      disabled={emailLoading || sending}
                    />
                    <Textarea
                      value={emailText}
                      onChange={(e) => setEmailText(e.target.value)}
                      rows={12}
                      placeholder={emailLoading ? 'Drafting…' : 'Email body…'}
                      disabled={emailLoading || sending}
                    />
                  </div>
                )}
              </div>
            ) : (
              hasWhatsApp && (
                <p className="text-xs text-text-muted">
                  No email address on file for this lead — WhatsApp only.
                </p>
              )
            )}
          </DialogBody>

          <DialogFooter className="flex items-center justify-between gap-2">
            <Button
              variant="ghost"
              size="sm"
              disabled={drafting || sending || (!waOn && !emailOn)}
              onClick={() => void regenerate()}
            >
              {drafting ? (
                <Loader2 className="h-4 w-4 animate-spin" aria-hidden="true" />
              ) : (
                <RefreshCw className="h-4 w-4" aria-hidden="true" />
              )}
              <span className="ml-1.5">Regenerate</span>
            </Button>

            <div className="flex items-center gap-2">
              <Button variant="ghost" size="sm" disabled={sending} onClick={() => setOpen(false)}>
                Cancel
              </Button>
              <Button variant="primary" size="sm" disabled={!canSend} onClick={() => void doSend()}>
                {sending ? (
                  <Loader2 className="h-4 w-4 animate-spin" aria-hidden="true" />
                ) : (
                  <Send className="h-4 w-4" aria-hidden="true" />
                )}
                <span className="ml-1.5">
                  Send{waOn && emailOn ? ' both' : emailOn ? ' email' : ''}
                </span>
              </Button>
            </div>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </>
  )
}
