/**
 * Redelivery of transiently-failed outbound messages.
 *
 * This is the capability BSPs sell as a premium feature: a message that Meta
 * deferred rather than refused gets another attempt later, instead of being
 * written off. Roughly 80% of this deployment's WhatsApp failures were Meta's
 * quality throttle, so the difference between having this and not having it is
 * most of the failed volume.
 *
 * Three rules keep it from doing harm, because a naive retry loop makes
 * delivery worse rather than better:
 *
 *   1. Only failures classified RETRYABLE are eligible. Permanent failures and
 *      opt-outs are never re-sent — see deliveryFailure.js.
 *   2. Backoff is long (6h, 24h, 72h) and jittered. The dominant retryable
 *      failure is a per-recipient throttle; retrying quickly is what triggered
 *      it, so retrying quickly again deepens it.
 *   3. A lead who has since replied, opted out, or been reached on any channel
 *      is dropped from the sweep. Re-sending into a live conversation is worse
 *      than not retrying at all.
 *
 * Nothing here sends autonomously on a schedule by default. It marks messages
 * as due and reports them; dispatch stays under whatever gate the operator or
 * agent uses to send.
 */
import prisma from '../utils/prismaClient.js';
import logger from '../utils/logger.js';
import {
  classifyDeliveryFailure,
  retryDelayMs,
  MAX_RETRY_ATTEMPTS,
} from './deliveryFailure.js';

/**
 * Find failed messages that genuinely deserve another attempt.
 *
 * @param {{ channel?: string, limit?: number, now?: Date }} opts
 * @returns {Promise<Array<{id:number, leadId:number, attempt:number, reason:string}>>}
 */
export async function findRetryable({ channel = 'whatsapp', limit = 200, now = new Date() } = {}) {
  const candidates = await prisma.message.findMany({
    where: {
      direction: 'outbound',
      channel,
      status: 'failed',
      retryCount: { lt: MAX_RETRY_ATTEMPTS },
      // A lead who replied or opted out is out of scope entirely.
      lead: {
        emailOptOut: false,
        status: { notIn: ['replied', 'engaged', 'closed', 'paused'] },
        NOT: { messages: { some: { direction: 'inbound' } } },
      },
    },
    select: {
      id: true,
      leadId: true,
      retryCount: true,
      providerStatusReason: true,
      ackUpdatedAt: true,
      updatedAt: true,
    },
    orderBy: { updatedAt: 'asc' },
    take: limit * 3, // over-fetch: classification filters most of these out
  });

  const due = [];
  for (const msg of candidates) {
    const { retryable } = classifyDeliveryFailure({ reason: msg.providerStatusReason });
    if (!retryable) continue;

    const attempt = msg.retryCount || 0;
    const lastAttemptAt = msg.ackUpdatedAt || msg.updatedAt;
    const waitedEnough =
      now.getTime() - new Date(lastAttemptAt).getTime() >= retryDelayMs(attempt + 1);
    if (!waitedEnough) continue;

    due.push({
      id: msg.id,
      leadId: msg.leadId,
      attempt: attempt + 1,
      reason: msg.providerStatusReason || '',
    });
    if (due.length >= limit) break;
  }
  return due;
}

/**
 * Queue due retries for dispatch. Does not send — it moves messages back into
 * `queued` so the normal send path picks them up under its usual limits.
 *
 * @param {{ channel?: string, limit?: number, dryRun?: boolean }} opts
 */
export async function sweep({ channel = 'whatsapp', limit = 200, dryRun = true } = {}) {
  const due = await findRetryable({ channel, limit });

  if (dryRun || due.length === 0) {
    return { due: due.length, queued: 0, dryRun: true, sample: due.slice(0, 5) };
  }

  let queued = 0;
  for (const item of due) {
    try {
      await prisma.message.update({
        where: { id: item.id },
        data: {
          status: 'queued',
          retryCount: item.attempt,
          scheduledAt: new Date(),
        },
      });
      queued += 1;
    } catch (error) {
      logger.warn(`retry sweep: could not queue message ${item.id}: ${error.message}`);
    }
  }

  logger.info(`🔁 Delivery retry: ${queued} of ${due.length} due ${channel} messages re-queued`);
  return { due: due.length, queued, dryRun: false };
}

export default { findRetryable, sweep };
