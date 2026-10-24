import { simpleParser } from 'mailparser';
import prisma from '../utils/prismaClient.js';
import { InboundEmailSpool } from '../utils/inboundEmailSpool.js';
import { EMAIL_INGRESS_MAX_BYTES } from '../utils/emailIngressSignature.js';
import { emailAttachmentHash, emailAttachmentMetadata, readEmailAttachmentMetadata } from '../utils/emailAttachments.js';

const failure = (message, statusCode) => Object.assign(new Error(message), { statusCode });

export class InboundEmailAttachments {
  constructor({ db = prisma, spool = new InboundEmailSpool(), parse = simpleParser, maxConcurrent = 2 } = {}) {
    Object.assign(this, { db, spool, parse, maxConcurrent });
    this.active = 0;
  }

  async receiptFor(messageId) {
    const message = await this.db.message.findUnique({ where: { id: messageId }, select: { id: true, leadId: true, channel: true, direction: true, emailAccountId: true } });
    if (!message || message.channel !== 'email' || message.direction !== 'inbound') throw failure('Inbound email message not found.', 404);
    // All signed-in workspace roles can read this conversation. A receipt from
    // a different receiving account must never supply its attachment bytes.
    return this.db.inboundEmailReceipt.findFirst({ where: { messageId: message.id, emailAccountId: message.emailAccountId, state: 'matched', rawPath: { not: null } }, orderBy: { id: 'asc' } });
  }

  async list(messageId) {
    const receipt = await this.receiptFor(messageId);
    if (!receipt) return { retained: false, items: [] };
    const metadata = receipt.attachmentMetadata === null
      ? await this.withOriginal(receipt, (_parsed, items) => items)
      : readEmailAttachmentMetadata(receipt.attachmentMetadata);
    return { retained: true, items: metadata.map(({ filename, contentType, size }, index) => ({ index, filename, contentType, size })) };
  }

  async download(messageId, index) {
    const receipt = await this.receiptFor(messageId);
    if (!receipt) throw failure('The original email is not available for attachment downloads.', 404);
    return this.fileFrom(receipt, index);
  }

  async retainedReceipt(id) {
    const receipt = await this.db.inboundEmailReceipt.findUnique({ where: { id } });
    if (!receipt) throw failure('Email receipt not found.', 404);
    if (!receipt.rawPath) throw failure('The original email was not retained. Its provider must redeliver it.', 404);
    return receipt;
  }

  async previewReceipt(id) {
    const receipt = await this.retainedReceipt(id);
    return this.withOriginal(receipt, (parsed, metadata) => ({
      subject: String(parsed.subject || '').slice(0, 2000),
      // MIME is parsed as text; HTML, remote images and sender scripts never
      // execute in the review surface, including HTML-only messages.
      text: typeof parsed.text === 'string' ? parsed.text.trim() : '',
      items: metadata.map(({ filename, contentType, size }, index) => ({ index, filename, contentType, size })),
    }));
  }

  async downloadReceipt(id, index) {
    return this.fileFrom(await this.retainedReceipt(id), index);
  }

  async fileFrom(receipt, index) {
    if (!Number.isSafeInteger(index) || index < 0) throw failure('Email attachment not found.', 404);
    return this.withOriginal(receipt, (parsed, metadata) => {
      if (index >= metadata.length) throw failure('Email attachment not found.', 404);
      const bytes = parsed.attachments[index].content;
      if (!Buffer.isBuffer(bytes) || bytes.length !== metadata[index].size || emailAttachmentHash(bytes) !== metadata[index].sha256) throw new Error('Retained attachment integrity mismatch');
      return { bytes, filename: metadata[index].filename };
    });
  }

  async withOriginal(receipt, read) {
    // Reject extra work instead of keeping an unbounded queue of MIME buffers.
    if (this.active >= this.maxConcurrent) throw failure('Attachment downloads are busy. Try again shortly.', 503);
    this.active++;
    try {
      const raw = await this.spool.read(receipt.rawPath, receipt.dedupeKey);
      if (!raw.length || raw.length > EMAIL_INGRESS_MAX_BYTES || emailAttachmentHash(raw) !== receipt.payloadHash) throw new Error('Retained email integrity mismatch');
      const parsed = await this.parse(raw, { skipTextToHtml: true, skipImageLinks: true });
      const actual = emailAttachmentMetadata(parsed);
      if (receipt.attachmentMetadata !== null) {
        const metadata = readEmailAttachmentMetadata(receipt.attachmentMetadata);
        if (actual.length !== metadata.length || actual.some((item, offset) => ['filename', 'contentType', 'size', 'contentId', 'sha256'].some(key => item[key] !== metadata[offset][key]))) throw new Error('Retained attachment integrity mismatch');
      }
      return read(parsed, actual);
    } finally { this.active--; }
  }
}

export default new InboundEmailAttachments();
