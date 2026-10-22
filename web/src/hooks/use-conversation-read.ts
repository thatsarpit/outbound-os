import { useCallback, useRef } from 'react'
import { useQueryClient } from '@tanstack/react-query'
import type { InboxThreadDetail } from '@/api/types'
import { inboxApi } from '@/api/endpoints/inbox'
import { useAuthStore } from '@/stores/auth-store'
import { IS_DEMO } from '@/demo/demo-chrome'

/** Call only when the conversation's latest messages are actually in view. */
export function useConversationRead(thread?: InboxThreadDetail | null) {
  const queryClient = useQueryClient()
  const scope = useAuthStore((state) => state.dashboardScope)
  const sent = useRef(new Set<string>())
  const leadId = thread?.leadId
  const messageId = thread?.messages.reduce((last, message) => Math.max(last, message.id), 0) ?? 0

  return useCallback(() => {
    if (
      IS_DEMO ||
      !leadId ||
      !messageId ||
      !navigator.onLine ||
      document.visibilityState !== 'visible'
    )
      return
    const key = `${scope}:${leadId}:${messageId}`
    if (sent.current.has(key)) return
    sent.current.add(key)
    void inboxApi
      .markRead(leadId, messageId)
      .then(() => {
        void queryClient.invalidateQueries({ queryKey: ['inbox-threads'] })
      })
      .catch(() => {
        sent.current.delete(key)
      })
  }, [leadId, messageId, scope, queryClient])
}
