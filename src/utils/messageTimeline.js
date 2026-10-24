/** Provider event time keeps delayed webhooks and imported history in chat order. */
export function messageEventTime(message) {
  const candidates = message.direction === 'inbound'
    ? [message.providerCreatedAt, message.sentAt, message.createdAt]
    : [message.sentAt, message.createdAt];
  for (const value of candidates) {
    if (value === null || value === undefined) continue;
    const timestamp = new Date(value).getTime();
    if (Number.isFinite(timestamp)) return timestamp;
  }
  return 0;
}

export function sortConversationMessages(messages) {
  return [...messages].sort((left, right) => messageEventTime(left) - messageEventTime(right)
    || left.id - right.id);
}
