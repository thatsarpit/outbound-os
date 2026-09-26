import {
  Building2,
  CheckCircle,
  Loader2,
  Mail,
  Phone,
  RotateCcw,
  User,
  UserPlus,
  X,
} from 'lucide-react'
import type { InboxChannel, InboxThreadDetail } from '@/api/types'
import { cn, getStatusColor } from '@/lib/utils'
import { ChannelBadge } from './channel-badge'
import { ThreadStatePill } from './thread-state-pill'

export function ThreadHeader({
  thread,
  activeChannel,
  drawer = false,
  onClose,
  onResolve,
  onReopen,
  onAssignSelf,
  isMutating = false,
}: {
  thread?: InboxThreadDetail | null
  activeChannel: InboxChannel
  drawer?: boolean
  onClose?: () => void
  onResolve?: () => void
  onReopen?: () => void
  onAssignSelf?: () => void
  isMutating?: boolean
}) {
  const isResolved = thread?.threadState === 'resolved' || thread?.status === 'closed'
  const isUnassigned = thread?.assignmentState === 'unassigned'

  return (
    <div className="border-b border-border px-4 py-4 sm:px-5">
      <div className="flex flex-col gap-4 lg:flex-row lg:items-start lg:justify-between">
        <div className="min-w-0">
          <div className="flex min-w-0 items-center gap-3">
            <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-md bg-accent-muted text-accent">
              <User className="h-4 w-4" />
            </div>
            <div className="min-w-0">
              <div className="flex flex-wrap items-center gap-2">
                <h2 className="truncate text-base font-semibold text-text-primary">
                  {thread?.leadName || thread?.name || 'Loading conversation'}
                </h2>
                <ChannelBadge channel={activeChannel} />
                {thread?.threadState && <ThreadStatePill state={thread.threadState} compact />}
              </div>
              <div className="mt-1 flex flex-wrap items-center gap-3 text-xs text-text-muted">
                {thread?.leadCompany && (
                  <span className="inline-flex items-center gap-1">
                    <Building2 className="h-3.5 w-3.5" />
                    {thread.leadCompany}
                  </span>
                )}
                {thread?.leadMobile && (
                  <span className="inline-flex items-center gap-1">
                    <Phone className="h-3.5 w-3.5" />
                    {thread.leadMobile}
                  </span>
                )}
                {thread?.leadEmail && (
                  <span className="inline-flex items-center gap-1">
                    <Mail className="h-3.5 w-3.5" />
                    {thread.leadEmail}
                  </span>
                )}
              </div>
            </div>
          </div>
          {activeChannel === 'email' && thread?.subject && (
            <p className="mt-3 rounded-md border border-border bg-surface-raised px-3 py-2 text-sm text-text-secondary">
              Subject: <span className="text-text-primary">{thread.subject}</span>
            </p>
          )}
        </div>

        <div className="flex items-center justify-between gap-3 lg:justify-end">
          <div className="flex flex-wrap items-center gap-2">
            {thread && (
              <>
                {!isResolved && onResolve && (
                  <button
                    type="button"
                    onClick={onResolve}
                    disabled={isMutating}
                    className="inline-flex items-center gap-1.5 rounded-lg border border-border bg-surface-raised px-2.5 py-1.5 text-xs font-medium text-text-secondary transition-colors hover:bg-success-muted hover:text-success disabled:opacity-50"
                    title="Mark as resolved"
                  >
                    {isMutating ? (
                      <Loader2 className="h-3 w-3 animate-spin" />
                    ) : (
                      <CheckCircle className="h-3 w-3" />
                    )}
                    Resolve
                  </button>
                )}
                {isResolved && onReopen && (
                  <button
                    type="button"
                    onClick={onReopen}
                    disabled={isMutating}
                    className="inline-flex items-center gap-1.5 rounded-lg border border-border bg-surface-raised px-2.5 py-1.5 text-xs font-medium text-text-secondary transition-colors hover:bg-warning-muted hover:text-warning disabled:opacity-50"
                    title="Reopen thread"
                  >
                    {isMutating ? (
                      <Loader2 className="h-3 w-3 animate-spin" />
                    ) : (
                      <RotateCcw className="h-3 w-3" />
                    )}
                    Reopen
                  </button>
                )}
                {isUnassigned && !isResolved && onAssignSelf && (
                  <button
                    type="button"
                    onClick={onAssignSelf}
                    disabled={isMutating}
                    className="inline-flex items-center gap-1.5 rounded-lg border border-border bg-surface-raised px-2.5 py-1.5 text-xs font-medium text-text-secondary transition-colors hover:bg-accent-muted hover:text-accent disabled:opacity-50"
                    title="Assign to me"
                  >
                    {isMutating ? (
                      <Loader2 className="h-3 w-3 animate-spin" />
                    ) : (
                      <UserPlus className="h-3 w-3" />
                    )}
                    Assign to me
                  </button>
                )}
              </>
            )}
            {thread?.status && (
              <span
                className={cn(
                  'rounded-full px-2.5 py-1 text-xs font-medium',
                  getStatusColor(thread.status),
                )}
              >
                {thread.status}
              </span>
            )}
            {thread?.senderAccount && (
              <span className="rounded-full border border-border bg-surface-raised px-2.5 py-1 text-xs text-text-secondary">
                Sender:{' '}
                {thread.senderAccount.senderName ||
                  thread.senderAccount.name ||
                  thread.senderAccount.email}
              </span>
            )}
          </div>
          {drawer && onClose && (
            <button
              type="button"
              onClick={onClose}
              className="rounded-lg p-2 text-text-muted transition-colors hover:bg-surface-raised hover:text-text-primary"
              aria-label="Close conversation"
            >
              <X className="h-4 w-4" />
            </button>
          )}
        </div>
      </div>
    </div>
  )
}
