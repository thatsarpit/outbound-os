import { createHash } from 'node:crypto';
import activityLog, { EVENT_TYPES } from '../utils/activityLog.js';
import prisma from '../utils/prismaClient.js';
import { whatsappFailureReason } from '../utils/whatsappSession.js';

const ranks = { sent: 1, failed: 1, delivered: 2, read: 3 };
export async function applyMetaReceipt(receipt) {
  let failedLeadId = null;
  const applied = await prisma.$transaction(async (tx) => {
    const messages = await tx.message.findMany({
      where: {
        channel: 'whatsapp',
        direction: 'outbound',
        waMessageId: receipt.waMessageId,
        waAccount: receipt.accountId,
      },
      select: { id: true, leadId: true, status: true, ackStatus: true },
    });
    if (messages.length !== 1) return false; // Never guess from a recipient's number.
    const message = messages[0];
    let pricing = {};
    try {
      pricing = JSON.parse(receipt.pricing || '{}');
    } catch {
      /* Retain delivery even without pricing. */
    }
    const data = {
      ...(pricing.category ? { pricingCategory: pricing.category } : {}),
      ...(pricing.type ? { pricingType: pricing.type } : {}),
      ...(typeof pricing.billable === 'boolean'
        ? { billable: pricing.billable }
        : {}),
    };
    const currentRank = Math.max(
      message.ackStatus || 0,
      ranks[message.status] || 0,
    );
    const incomingRank = ranks[receipt.status];
    // A failed or late sent receipt cannot erase evidence of delivery/read.
    if (
      incomingRank > currentRank ||
      (receipt.status === 'failed' && currentRank < 2) ||
      (receipt.status === 'sent' && message.status === 'sending')
    ) {
      data.status = receipt.status;
      data.ackStatus =
        receipt.status === 'failed' ? message.ackStatus : incomingRank;
      data.ackUpdatedAt = receipt.receivedAt;
      data.providerStatusReason =
        receipt.status === 'failed'
          ? whatsappFailureReason(receipt.failureCode, receipt.failureReason)
          : receipt.status === 'sent'
            ? 'provider_sent'
            : null;
    }
    if (data.status === 'failed' && message.status !== 'failed')
      failedLeadId = message.leadId;
    await tx.message.update({ where: { id: message.id }, data });
    await tx.whatsAppReceipt.update({
      where: { id: receipt.id },
      data: { appliedAt: new Date() },
    });
    return true;
  });
  if (failedLeadId !== null)
    activityLog.add(
      EVENT_TYPES.MESSAGE_FAILED,
      'WhatsApp message was not delivered. Open the conversation for details.',
      {
        leadId: failedLeadId,
        accountId: receipt.accountId,
        channel: 'whatsapp',
        reason: whatsappFailureReason(
          receipt.failureCode,
          receipt.failureReason,
        ),
      },
    );
  return applied;
}
export async function recordMetaReceipt({
  accountId,
  waMessageId,
  status,
  failureCode,
  failureReason,
  pricing,
  timestamp,
}) {
  if (
    !accountId ||
    typeof waMessageId !== 'string' ||
    !Object.hasOwn(ranks, status)
  )
    return;
  const safePricing = {
    ...(typeof pricing?.category === 'string'
      ? { category: pricing.category.slice(0, 40) }
      : {}),
    ...(typeof pricing?.type === 'string'
      ? { type: pricing.type.slice(0, 40) }
      : {}),
    ...(typeof pricing?.billable === 'boolean'
      ? { billable: pricing.billable }
      : {}),
  };
  const data = {
    accountId,
    waMessageId,
    status,
    failureCode: Number.isSafeInteger(failureCode) ? failureCode : null,
    failureReason:
      typeof failureReason === 'string' ? failureReason.slice(0, 300) : null,
    pricing: JSON.stringify(safePricing),
  };
  const eventKey = createHash('sha256')
    .update(JSON.stringify({ ...data, timestamp }))
    .digest('hex');
  const receipt = await prisma.whatsAppReceipt.upsert({
    where: { eventKey },
    create: { ...data, eventKey },
    update: {},
  });
  if (!receipt.appliedAt) await applyMetaReceipt(receipt);
}
export async function reconcileMetaReceipts(waMessageId, accountId) {
  const receipts = await prisma.whatsAppReceipt.findMany({
    where: { waMessageId, accountId, appliedAt: null },
    orderBy: { id: 'asc' },
  });
  for (const receipt of receipts) await applyMetaReceipt(receipt);
}

/** Retry receipts that arrived before their outbound row, without sending any messages. */
export async function replayPendingMetaReceipts(limit = 100) {
  const receipts = await prisma.whatsAppReceipt.findMany({
    where: { appliedAt: null },
    orderBy: [{ lastCheckedAt: 'asc' }, { id: 'asc' }],
    take: limit,
  });
  let applied = 0;
  for (const receipt of receipts) {
    if (await applyMetaReceipt(receipt)) applied++;
    else {
      // Rotate unmatched facts so an orphan receipt cannot starve newer receipts.
      await prisma.whatsAppReceipt.update({
        where: { id: receipt.id },
        data: { lastCheckedAt: new Date() },
      });
    }
  }
  return { checked: receipts.length, applied };
}
