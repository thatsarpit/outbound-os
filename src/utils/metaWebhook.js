/** Readable text for any inbound message type, so a media reply still counts. */
export function metaInboundText(msg) {
  return msg?.text?.body
    || msg?.button?.text
    || msg?.interactive?.button_reply?.title
    || msg?.interactive?.list_reply?.title
    || msg?.image?.caption
    || msg?.video?.caption
    || msg?.document?.caption
    || msg?.reaction?.emoji
    || (msg?.type === 'image' ? '[Photo]'
      : msg?.type === 'video' ? '[Video]'
        : msg?.type === 'audio' ? (msg.audio?.voice ? '[Voice message]' : '[Audio]')
          : msg?.type === 'document' ? `[Document] ${msg.document?.filename || ''}`.trim()
            : msg?.type === 'sticker' ? '[Sticker]'
              : msg?.type ? `[${msg.type}]` : '');
}
