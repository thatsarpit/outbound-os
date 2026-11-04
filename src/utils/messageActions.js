export const REACTION_EMOJI = ['👍', '❤️', '😂', '😮', '😢', '🙏'];

export function nativeMessageId(message) {
  if (message.channel === 'whatsapp') return [message.providerMessageId, message.waMessageId].find(id => /^wamid\./.test(id || '')) || null;
  if (message.channel === 'telegram') return message.telegramMessageId || null;
  if (message.channel === 'email') return message.emailMessageId || null;
  return null;
}
export function messageAccount(message) {
  return message.channel === 'telegram' ? message.telegramAccountId : message.waAccount;
}
export function assertReplyTarget(target, leadId, channel, accountId) {
  if (!target || target.leadId !== leadId || target.channel !== channel || (accountId && messageAccount(target) !== accountId))
    throw Object.assign(new Error('Choose a message in this conversation and sending account.'), { statusCode: 400 });
  const id = nativeMessageId(target);
  if (!id) throw Object.assign(new Error('The original message identifier is unavailable. Send a normal message instead.'), { statusCode: 409 });
  return id;
}
export function reactionTarget(message) {
  const id = nativeMessageId(message);
  return message.channel === 'telegram' ? `${message.leadId}:${id}` : id;
}
export function reactionKey(message, actorKey) {
  return { channel: message.channel, accountId: messageAccount(message), targetId: reactionTarget(message), actorKey };
}
