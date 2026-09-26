import { useState } from 'react'
import { ChevronDown, Clock, Loader2, Send } from 'lucide-react'
import type { InboxChannel, InboxSenderAccount, MediaFile } from '@/api/types'
import { cn } from '@/lib/utils'
import { CHANNELS, CHANNEL_ORDER, getChannel } from '@/lib/channels'
import { SenderAccountSelect } from './sender-account-select'
import { EmailEditor } from './email-editor'
import { AttachmentPicker } from './attachment-picker'
import { TemplatePicker, type TemplatePickerOption } from './template-picker'

type ComposerBarProps = {
  channel: InboxChannel
  onChannelChange: (channel: InboxChannel) => void
  subject: string
  onSubjectChange: (value: string) => void
  text: string
  onTextChange: (value: string) => void
  htmlBody: string
  onHtmlBodyChange: (value: string) => void
  onSend: () => void
  sendPending: boolean
  senderAccounts: InboxSenderAccount[]
  senderAccountId: number | null
  onSenderAccountChange: (value: number | null) => void
  helperLabel?: string
  placeholder?: string
  disabled?: boolean
  sendDisabled?: boolean
  templates?: TemplatePickerOption[]
  selectedTemplateId?: number | null
  onTemplateChange?: (value: number | null) => void
  onApplyTemplate?: () => void
  templatesLoading?: boolean
  templateApplyPending?: boolean
  templateDisabled?: boolean
  templateLabel?: string
  templateDescription?: string
  attachments?: MediaFile[]
  onAddAttachment?: (file: MediaFile) => void
  onRemoveAttachment?: (id: number) => void
  cc?: string
  onCcChange?: (value: string) => void
  bcc?: string
  onBccChange?: (value: string) => void
  onScheduleSend?: (scheduledAt: string) => void
}

export function ComposerBar({
  channel,
  onChannelChange,
  subject,
  onSubjectChange,
  text,
  onTextChange,
  htmlBody,
  onHtmlBodyChange,
  onSend,
  sendPending,
  senderAccounts,
  senderAccountId,
  onSenderAccountChange,
  helperLabel,
  placeholder,
  disabled = false,
  sendDisabled = false,
  templates = [],
  selectedTemplateId = null,
  onTemplateChange,
  onApplyTemplate,
  templatesLoading = false,
  templateApplyPending = false,
  templateDisabled = false,
  templateLabel,
  templateDescription,
  attachments = [],
  onAddAttachment,
  onRemoveAttachment,
  cc = '',
  onCcChange,
  bcc = '',
  onBccChange,
  onScheduleSend,
}: ComposerBarProps) {
  const isEmail = channel === 'email'
  const showTemplatePicker = isEmail && onTemplateChange && onApplyTemplate
  const noSenders = isEmail && senderAccounts.length === 0
  const [showCcBcc, setShowCcBcc] = useState(false)
  const [showSchedule, setShowSchedule] = useState(false)
  const [scheduleDate, setScheduleDate] = useState('')

  return (
    <div className="border-t border-border px-4 py-3 sm:px-5">
      <div className="flex flex-col gap-3">
        <div className="flex flex-wrap items-center justify-between gap-3">
          {/* Channel switcher. One entry per channel from the shared registry,
              so a new channel appears here automatically and the active tint
              always matches the colour used in the thread list and header. */}
          <div className="flex min-w-0 items-center gap-0.5 overflow-x-auto rounded-md border border-border bg-surface-raised p-0.5 scrollbar-hide">
            {CHANNEL_ORDER.map((id) => {
              const meta = CHANNELS[id]
              const Icon = meta.icon
              const active = id === 'email' ? isEmail : channel === id
              return (
                <button
                  key={id}
                  type="button"
                  onClick={() => onChannelChange(id)}
                  aria-pressed={active}
                  className={cn(
                    'inline-flex shrink-0 items-center gap-1.5 rounded-sm px-2.5 py-1.5 text-[13px] font-medium transition-colors',
                    active
                      ? cn(meta.bg, meta.text)
                      : 'text-text-secondary hover:bg-surface hover:text-text-primary',
                  )}
                >
                  <Icon className="h-3.5 w-3.5" />
                  {meta.label}
                </button>
              )
            })}
          </div>
          <div className="flex items-center gap-2 text-[11px] text-text-muted">
            <span>{helperLabel || 'Enter to send \u00b7 Shift+Enter for a new line'}</span>
          </div>
        </div>

        {isEmail && (
          <div className="space-y-3">
            {noSenders ? (
              <div className="rounded-md border border-warning/30 bg-warning-muted/30 px-4 py-3 text-sm text-warning">
                No email sender configured.{' '}
                <a href="/settings" className="font-medium underline hover:text-warning/80">
                  Add one in Settings
                </a>{' '}
                to start sending emails.
              </div>
            ) : (
              <div className="space-y-2">
                <div className="grid gap-2 lg:grid-cols-[minmax(0,1fr)_260px]">
                  <input
                    type="text"
                    value={subject}
                    onChange={(event) => onSubjectChange(event.target.value)}
                    placeholder="Email subject"
                    disabled={disabled}
                    className={cn(
                      'min-h-11 rounded-md border border-border bg-surface-raised px-4 py-2.5 text-sm text-text-primary',
                      'placeholder:text-text-muted focus:border-accent focus:outline-none focus:ring-1 focus:ring-accent/30',
                      'disabled:cursor-not-allowed disabled:opacity-50',
                    )}
                  />
                  <SenderAccountSelect
                    accounts={senderAccounts}
                    value={senderAccountId}
                    onChange={onSenderAccountChange}
                    disabled={disabled}
                  />
                </div>

                {/* CC/BCC toggle + fields */}
                {onCcChange && onBccChange && (
                  <>
                    {!showCcBcc ? (
                      <button
                        type="button"
                        onClick={() => setShowCcBcc(true)}
                        className="text-xs text-text-muted transition-colors hover:text-text-secondary"
                      >
                        + CC / BCC
                      </button>
                    ) : (
                      <div className="grid gap-2 sm:grid-cols-2">
                        <input
                          type="text"
                          value={cc}
                          onChange={(e) => onCcChange(e.target.value)}
                          placeholder="CC (comma-separated emails)"
                          disabled={disabled}
                          className={cn(
                            'rounded-md border border-border bg-surface-raised px-3 py-2 text-sm text-text-primary',
                            'placeholder:text-text-muted focus:border-accent focus:outline-none focus:ring-1 focus:ring-accent/30',
                          )}
                        />
                        <input
                          type="text"
                          value={bcc}
                          onChange={(e) => onBccChange(e.target.value)}
                          placeholder="BCC (comma-separated emails)"
                          disabled={disabled}
                          className={cn(
                            'rounded-md border border-border bg-surface-raised px-3 py-2 text-sm text-text-primary',
                            'placeholder:text-text-muted focus:border-accent focus:outline-none focus:ring-1 focus:ring-accent/30',
                          )}
                        />
                      </div>
                    )}
                  </>
                )}
              </div>
            )}
            {showTemplatePicker && (
              <TemplatePicker
                templates={templates}
                value={selectedTemplateId}
                onChange={onTemplateChange}
                onApply={onApplyTemplate}
                loading={templatesLoading}
                applyPending={templateApplyPending}
                disabled={disabled || templateDisabled}
                label={templateLabel}
                description={templateDescription}
                className="p-3"
              />
            )}
          </div>
        )}

        {isEmail && onAddAttachment && onRemoveAttachment && (
          <AttachmentPicker
            attachments={attachments}
            onAdd={onAddAttachment}
            onRemove={onRemoveAttachment}
            disabled={disabled || noSenders}
          />
        )}

        <div className="flex flex-col gap-2 sm:flex-row sm:items-end">
          {isEmail ? (
            <EmailEditor
              content={htmlBody}
              onChange={onHtmlBodyChange}
              onPlainTextChange={onTextChange}
              onSend={sendDisabled ? undefined : onSend}
              placeholder={placeholder || 'Write your email\u2026'}
              disabled={disabled || noSenders}
              className="flex-1"
            />
          ) : (
            <textarea
              value={text}
              onChange={(event) => onTextChange(event.target.value)}
              onKeyDown={(event) => {
                if (event.key === 'Enter' && !event.shiftKey) {
                  event.preventDefault()
                  if (!sendDisabled) onSend()
                }
              }}
              placeholder={
                placeholder ||
                `Type a ${getChannel(channel).label} reply\u2026`
              }
              rows={3}
              disabled={disabled}
              className={cn(
                'min-h-24 flex-1 resize-none rounded-md border border-border bg-surface-raised px-4 py-3 text-sm text-text-primary',
                'placeholder:text-text-muted focus:border-accent focus:outline-none focus:ring-1 focus:ring-accent/30',
                'disabled:cursor-not-allowed disabled:opacity-50',
              )}
            />
          )}
          <div className="flex items-center gap-1 self-end sm:self-auto">
            <button
              type="button"
              onClick={onSend}
              disabled={sendDisabled}
              className={cn(
                'inline-flex min-h-12 items-center justify-center gap-2 px-4 py-3 text-sm font-medium text-accent-fg',
                'transition-colors hover:bg-accent-hover disabled:cursor-not-allowed disabled:opacity-50',
                isEmail && onScheduleSend ? 'rounded-l-2xl bg-accent' : 'rounded-md bg-accent',
              )}
            >
              {sendPending ? (
                <Loader2 className="h-4 w-4 animate-spin" />
              ) : (
                <>
                  <span>{isEmail ? 'Send Email' : 'Send Message'}</span>
                  <Send className="h-4 w-4" />
                </>
              )}
            </button>

            {/* Schedule dropdown */}
            {isEmail && onScheduleSend && (
              <div className="relative">
                <button
                  type="button"
                  onClick={() => setShowSchedule(!showSchedule)}
                  disabled={sendDisabled}
                  className={cn(
                    'inline-flex min-h-12 items-center justify-center rounded-r-2xl border-l border-border bg-accent px-2.5 py-3 text-accent-fg',
                    'transition-colors hover:bg-accent-hover disabled:cursor-not-allowed disabled:opacity-50',
                  )}
                >
                  <ChevronDown className="h-4 w-4" />
                </button>

                {showSchedule && (
                  <div className="absolute bottom-full right-0 z-20 mb-2 w-64 rounded-md border border-border bg-surface-raised p-3 shadow-md">
                    <p className="mb-2 flex items-center gap-1.5 text-xs font-medium text-text-secondary">
                      <Clock className="h-3.5 w-3.5" />
                      Schedule for later
                    </p>
                    <input
                      type="datetime-local"
                      value={scheduleDate}
                      onChange={(e) => setScheduleDate(e.target.value)}
                      min={new Date().toISOString().slice(0, 16)}
                      className={cn(
                        'w-full rounded-lg border border-border bg-surface-overlay px-3 py-2 text-sm text-text-primary',
                        'focus:border-accent focus:outline-none focus:ring-1 focus:ring-accent/30',
                      )}
                    />
                    <button
                      type="button"
                      onClick={() => {
                        if (!scheduleDate) return
                        onScheduleSend(new Date(scheduleDate).toISOString())
                        setShowSchedule(false)
                        setScheduleDate('')
                      }}
                      disabled={!scheduleDate}
                      className={cn(
                        'mt-2 w-full rounded-lg bg-accent px-3 py-2 text-xs font-semibold text-accent-fg transition-colors',
                        'hover:bg-accent-hover disabled:cursor-not-allowed disabled:opacity-50',
                      )}
                    >
                      Schedule Send
                    </button>
                  </div>
                )}
              </div>
            )}
          </div>
        </div>
      </div>
    </div>
  )
}
