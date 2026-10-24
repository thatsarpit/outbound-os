import { isHumanReply } from './emailInbound.js';
import { messageEventTime } from './messageTimeline.js';

/** A read position belongs to a human identity, never to the shared MCP key. */
export function inboxViewerKey(user) {
  const id = user?.id ?? user?.sub;
  if (id === undefined || id === null || id === 'mcp-service') return null;
  return `${user.orgId || 'local'}:${String(id)}`;
}

export function inboxThreadState({ lead, lastMessage, assignedToId }) {
  const resolvedAt = lead.inboxResolvedAt ? new Date(lead.inboxResolvedAt).getTime() : null;
  const messageAt = lastMessage ? messageEventTime(lastMessage) : null;
  if (resolvedAt !== null && (!isHumanReply(lastMessage) || messageAt <= resolvedAt)) return 'resolved';
  if (isHumanReply(lastMessage)) return 'needs_reply';
  return assignedToId ? 'assigned' : 'unassigned';
}

/** Unrendered campaign sources are not evidence of the provider's sent copy. */
export function inboxMessagePreview(message) {
  if (!message) return '';
  if (message.channel === 'email' && message.direction === 'outbound'
    && /\{\{\s*(?:contact\.|unsubscribe\b)/i.test(message.content || '')) {
    return 'Campaign email sent · open to view the archived template';
  }
  const text = String(message.content || '').replace(/\s+/g, ' ').trim();
  if (message.channel === 'whatsapp' && message.direction === 'inbound'
    && /^\[(unsupported|Unsupported WhatsApp message)\]$/i.test(text)) {
    return 'WhatsApp message content unavailable';
  }
  return message.direction === 'outbound' ? `You: ${text}` : text;
}

/** Legacy unsupported rows retain their original data while the inbox explains it. */
export function inboxMessageContent(message) {
  if (message.channel === 'whatsapp' && message.direction === 'inbound'
    && /^\[(unsupported|Unsupported WhatsApp message)\]$/i.test(String(message.content || '').trim())) {
    return 'WhatsApp could not provide this message’s content. Ask the customer to resend it as a standard text, photo or file.';
  }
  return message.content;
}

/** Local integer assignments cannot be inferred from an unrelated Clerk identity. */
export function localInboxAssigneeId(user) {
  if (user?.orgId && user.orgId !== 'local') return null;
  const id = user?.id ?? user?.sub;
  if (!/^[1-9]\d*$/.test(String(id ?? ''))) return null;
  const numeric = Number(id);
  return Number.isSafeInteger(numeric) ? numeric : null;
}
