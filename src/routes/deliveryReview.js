import { Router } from 'express';
import { requireRole } from '../auth/index.js';
import { getAccessiblePoolIds } from '../auth/rbac.js';
import prisma from '../utils/prismaClient.js';
import logger from '../utils/logger.js';
import { OVERDUE_GRACE_MINUTES, queueWorkerStatus } from '../services/queueHealth.js';

const router = Router();
const CHANNELS = ['whatsapp', 'email', 'imessage', 'telegram'];
const FAILED = ['failed', 'permanently_failed', 'bounced'];
const FILTERS = {
  attention: [...FAILED, 'unconfirmed'],
  failed: FAILED,
  unconfirmed: ['unconfirmed'],
  queued: ['queued'],
  overdue: ['queued'],
  sending: ['sending'],
};
const PAGE_SIZE = 25;

// These explanations come from stable internal reasons and known provider
// events. The review list does not need raw provider responses or message bodies.
const REASONS = new Map([
  ['payment_issue', 'Check billing or the sending account balance.'],
  ['auth_failed', 'Check the sending account credentials.'],
  ['not_on_whatsapp', 'Check whether the recipient can receive WhatsApp messages.'],
  ['invalid_phone', 'Check the recipient’s phone number and country code.'],
  ['re_engagement_required', 'WhatsApp required an approved template for this message.'],
  ['thread_not_owned', 'Check conversation routing for the connected WhatsApp provider.'],
  ['template_invalid', 'Review the provider’s approved template and its variables.'],
  ['marketing_limit', 'The provider restricted marketing delivery. Check the recipient’s eligibility in the provider console.'],
  ['rate_limited', 'The provider limited the sending rate. Check sender capacity and provider limits.'],
  ['quota_exceeded', 'Check the provider’s sending quota.'],
  ['whatsapp_marketing_opted_out', 'The recipient opted out of marketing messages.'],
  ['waiting_for_verified_email_sender', 'Waiting for a verified email sender.'],
  ['waiting_for_daily_email_capacity', 'Waiting for daily email capacity.'],
  ['waiting_for_hourly_email_capacity', 'Waiting for hourly email capacity.'],
  ['recipient_email_missing', 'Add or correct the recipient’s email address.'],
  ['email_attachment_unavailable', 'A required attachment is missing from the media library.'],
  ['email_attachments_unsupported', 'This sender cannot send email attachments.'],
  ['recipient_suppressed', 'The address is suppressed for email.'],
  ['brevo_webhook:hard_bounce', 'The email provider reported a hard bounce. Check the address and its suppression status.'],
  ['brevo_webhook:invalid', 'The email provider reported an invalid address.'],
]);

function reviewDetail(message) {
  if (message.status === 'unconfirmed') {
    return 'Check the sending provider’s history before sending again.';
  }
  if (message.status === 'sending') return 'The worker marked this message as sending.';
  if (message.status === 'queued' && !message.scheduledAt) return 'No send time is recorded. Review the conversation.';
  return REASONS.get(message.providerStatusReason)
    || (message.status === 'queued' ? 'Waiting for the queue worker.' : 'Check the conversation and the sending provider for details.');
}

async function loadReceiptActivity() {
  // Receipt IDs follow local insertion order. Replays preserve the original
  // ID and timestamp, and provider event times can arrive out of order.
  const latest = { orderBy: { id: 'desc' }, select: { receivedAt: true } };
  const brevo = { provider: 'brevo' };
  const [whatsapp, email, whatsappUnmatched, emailUnmatched] = await prisma.$transaction([
    prisma.whatsAppReceipt.findFirst(latest),
    prisma.emailDeliveryEvent.findFirst({ ...latest, where: brevo }),
    prisma.whatsAppReceipt.count({ where: { appliedAt: null } }),
    prisma.emailDeliveryEvent.count({ where: { ...brevo, outcome: 'unmatched' } }),
  ]);
  return [
    { source: 'whatsapp', lastReceivedAt: whatsapp?.receivedAt ?? null, unmatched: whatsappUnmatched },
    { source: 'brevo', lastReceivedAt: email?.receivedAt ?? null, unmatched: emailUnmatched },
  ];
}

router.get('/messages/review', requireRole('manager'), async (req, res) => {
  const { status = 'attention', channel, page: pageInput = '1' } = req.query;
  if (typeof status !== 'string' || !Object.hasOwn(FILTERS, status)
    || (channel !== undefined && !CHANNELS.includes(channel))
    || typeof pageInput !== 'string' || !/^[1-9][0-9]*$/.test(pageInput)
    || !Number.isSafeInteger(Number(pageInput))) {
    return res.status(400).json({ error: 'Choose a valid delivery status, channel and page.' });
  }

  try {
    const pools = await getAccessiblePoolIds(req);
    const scope = {
      direction: 'outbound',
      channel: channel || { in: CHANNELS },
      ...(pools === null ? {} : { lead: { poolId: { in: pools } } }),
    };

    const overdueAt = new Date(Date.now() - OVERDUE_GRACE_MINUTES * 60_000);
    const overdueWhere = { status: 'queued', scheduledAt: { lte: overdueAt } };
    const result = await prisma.$transaction(async tx => {
      const totals = await tx.message.groupBy({
        by: ['status'],
        where: { ...scope, status: { in: [...FILTERS.attention, ...FILTERS.queued, ...FILTERS.sending] } },
        _count: { _all: true },
      });
      const byStatus = new Map(totals.map(row => [row.status, row._count._all]));
      const counts = Object.fromEntries(Object.entries(FILTERS).map(([filter, statuses]) => [
        filter, statuses.reduce((sum, value) => sum + (byStatus.get(value) || 0), 0),
      ]));
      counts.overdue = counts.queued
        ? await tx.message.count({ where: { ...scope, ...overdueWhere } })
        : 0;
      const total = counts[status];
      const pages = Math.max(1, Math.ceil(total / PAGE_SIZE));
      const page = Math.min(Number(pageInput), pages);
      const rows = total === 0 ? [] : await tx.message.findMany({
        where: { ...scope, ...(status === 'overdue' ? overdueWhere : { status: { in: FILTERS[status] } }) },
        orderBy: status === 'overdue'
          ? [{ scheduledAt: 'asc' }, { id: 'asc' }]
          : [{ updatedAt: 'desc' }, { id: 'desc' }],
        skip: (page - 1) * PAGE_SIZE,
        take: PAGE_SIZE,
        select: {
          id: true,
          leadId: true,
          channel: true,
          status: true,
          campaignId: true,
          emailAccountId: true,
          scheduledAt: true,
          updatedAt: true,
          providerStatusReason: true,
          providerErrorCode: true,
          lead: { select: { name: true } },
        },
      });
      const items = rows.map(({ providerStatusReason, providerErrorCode, lead, ...row }) => ({
        ...row,
        leadName: lead.name,
        overdue: row.status === 'queued' && row.scheduledAt !== null && row.scheduledAt <= overdueAt,
        detail: reviewDetail({ status: row.status, scheduledAt: row.scheduledAt, providerStatusReason }),
        providerCode: /^\d{3,10}$/.test(providerErrorCode || '') ? providerErrorCode : null,
      }));
      return { items, counts, total, page, pages };
    });

    const [workers, receiptActivity] = await Promise.all([
      queueWorkerStatus(prisma).catch(error => {
        logger.warn(`Could not load queue scan status: ${error.message}`);
        return null;
      }),
      loadReceiptActivity().catch(error => {
        logger.warn(`Could not load provider receipt activity: ${error.message}`);
        return null;
      }),
    ]);
    res.json({ ...result, workers, receiptActivity, overdueGraceMinutes: OVERDUE_GRACE_MINUTES });
  } catch (error) {
    logger.warn(`Delivery review failed: ${error.message}`);
    res.status(500).json({ error: 'Could not load delivery review.' });
  }
});

export default router;
