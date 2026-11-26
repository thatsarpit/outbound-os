const CHANNEL_LABELS = { whatsapp: 'WhatsApp', email: 'Email', imessage: 'iMessage', telegram: 'Telegram', webchat: 'Website chat' };

/** Push banners use plain text: remove markup, invisible controls and excess whitespace. */
export function pushPlainText(value, length) {
  if (typeof value !== 'string') return '';
  const plain = value.replace(/&(?:nbsp|#160);/gi, ' ')
    .replace(/&lt;/gi, '<').replace(/&gt;/gi, '>').replace(/&amp;/gi, '&')
    .replace(/<(script|style)\b[^>]*>[\s\S]*?<\/\1>/gi, ' ').replace(/<[^>]*>/g, ' ')
    .replace(/[\u0000-\u001f\u007f-\u009f\u200b\u202a-\u202e\u2066-\u2069\ufeff]/g, ' ')
    .replace(/\s+/g, ' ').trim();
  const characters = Array.from(new Intl.Segmenter(undefined, { granularity: 'grapheme' }).segment(plain), item => item.segment);
  return characters.length > length ? `${characters.slice(0, length - 1).join('')}…` : plain;
}

function messagePreview(message) {
  const content = pushPlainText(message.content, 160);
  const caption = pushPlainText(message.mediaCaption, 120);
  const media = { image: 'Photo', video: 'Video', audio: /^\[Voice message\]/i.test(content) ? 'Voice message' : 'Audio', pdf: 'Document', document: 'Document', sticker: 'Sticker' }[message.mediaType];
  if (media) return caption ? `${media}: ${caption}` : media;
  if (/^\[(?:unsupported|Unsupported WhatsApp message)\]$/i.test(content)) return 'New message';
  return content || (message.channel === 'webchat' ? 'Attachment' : 'New message');
}

export function buildMessagePush(message, previewMode = 'private') {
  const channel = Object.hasOwn(CHANNEL_LABELS, message.channel) ? message.channel : null;
  const label = CHANNEL_LABELS[channel] || 'customer';
  const sender = pushPlainText(message.lead?.name, 48) || 'Customer';
  const privatePreview = !['sender', 'message'].includes(previewMode);
  const timestamp = new Date(message.providerCreatedAt || message.sentAt || message.createdAt).getTime();
  return {
    title: privatePreview ? `New ${label} message` : `${sender} · ${label}`,
    body: privatePreview ? 'Open Outbound OS to read and reply.' : previewMode === 'sender' ? 'Sent you a message.' : messagePreview(message),
    // A conversation has one banner: bursts and retries replace it with the latest message.
    tag: `conversation-${message.leadId}-${channel || 'customer'}`,
    url: `/m/inbox?leadId=${message.leadId}${channel ? `&channel=${channel}` : ''}`,
    ...(Number.isFinite(timestamp) ? { timestamp } : {}),
  };
}
