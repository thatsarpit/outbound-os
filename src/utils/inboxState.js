import { isHumanReply } from './emailInbound.js';

/** A read position belongs to a human identity, never to the shared MCP key. */
export function inboxViewerKey(user) {
  const id = user?.id ?? user?.sub;
  if (id === undefined || id === null || id === 'mcp-service') return null;
  return `${user.orgId || 'local'}:${String(id)}`;
}

export function inboxThreadState({ lead, lastMessage, assignedToId }) {
  const resolvedAt = lead.inboxResolvedAt ? new Date(lead.inboxResolvedAt).getTime() : null;
  const messageAt = lastMessage ? new Date(lastMessage.createdAt).getTime() : null;
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
  return message.direction === 'outbound' ? `You: ${text}` : text;
}
