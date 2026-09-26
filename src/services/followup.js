import prisma from '../utils/prismaClient.js';
import deliveryRetry from './deliveryRetry.js';
import config from '../config.js';
import logger from '../utils/logger.js';
import { getMessage } from '../templates/messages.js';
import { isBusinessHours, randomDelay } from '../utils/delay.js';
import whatsappManager from './whatsapp.js';
import composer from './messageComposer.js';
import replyDetector from './replyDetector.js';
import leadStateService from '../domain/leadStateService.js';
import emailService from './emailService.js';
import imessageService from './imessage.js';

try {
} catch(e) {}

/**
 * Follow-up Engine
 * Manages the follow-up message sequence for each lead.
 * Sends up to 5 follow-up messages at configurable intervals.
 * Stops when buyer replies or max follow-ups reached.
 */
class FollowupEngine {
  constructor() {
    this.running = false;
  }

  /**
   * Recover messages stuck in 'sending' status due to a process crash.
   * Should be called once at startup.
   */
  async recoverStuckMessages() {
    try {
      const fiveMinAgo = new Date(Date.now() - 5 * 60 * 1000);
      // BlueBubbles can deliver through AppleScript and still time out at the
      // HTTP layer. Reconcile those rows against BlueBubbles history before a
      // generic crash recovery has a chance to requeue a duplicate.
      const imessage = await imessageService.recoverStuckMessages({ staleMinutes: 5 });
      const result = await prisma.message.updateMany({
        where: {
          status: 'sending',
          direction: 'outbound',
          channel: { not: 'imessage' },
          updatedAt: { lt: fiveMinAgo },
        },
        data: { status: 'queued' },
      });
      const count = result.count + imessage.count;
      if (count > 0) {
        logger.info(`🔧 Recovered ${count} stuck 'sending' message(s) (${imessage.confirmed} iMessage confirmed, ${result.count + imessage.requeued} requeued)`);
      }
      return { count, requeued: result.count + imessage.requeued, imessage };
    } catch (e) {
      logger.warn(`Failed to recover stuck messages: ${e.message}`);
      return { count: 0, error: e.message };
    }
  }

  /**
   * Queue the initial outreach for a new lead.
   * Multi-channel: tries WhatsApp first, falls back to email if WA unavailable.
   * @param {object} lead - Lead record from database
   */
  async queueInitialOutreach(lead, options = {}) {
    const latest = await prisma.lead.findUnique({
      where: { id: lead.id },
      select: { status: true, isOnWhatsApp: true, email: true },
    });
    if (latest && leadStateService.shouldBlockAutomation(latest.status)) {
      logger.info(`⏭️ Skipping initial outreach for Lead ${lead.id}: status is ${latest.status}`);
      return;
    }

    // Decide channel: WhatsApp first, email fallback
    const waUnavailable = latest?.isOnWhatsApp === false;
    const hasEmail = !!(lead.email || latest?.email);

    if (waUnavailable && hasEmail) {
      return this._queueInitialEmailOutreach(lead);
    }

    // Try WhatsApp — use preferred account if provided (ensures persona consistency
    // when a caller has already selected the account).
    const accountId =
      options.preferredAccountId ||
      (await whatsappManager.getNextAccount({ forInitialOutreach: true }));

    if (!accountId) {
      // Prefer email fallback when every WhatsApp account is unavailable.
      if (hasEmail) {
        logger.info(`📧 No available WA account for Lead ${lead.id}, falling back to email`);
        return this._queueInitialEmailOutreach(lead);
      }
      logger.info(`⏸️ Holding Lead ${lead.id}: no WhatsApp account and no email on file`);
      return;
    }

    // Update lead with assigned account
    await prisma.lead.update({
      where: { id: lead.id },
      data: {
        assignedAccount: accountId,
        status: 'contacted',
      },
    });

    // Generate personalized message via LLM (with per-account persona)
    // CRITICAL: We MUST get the correct account profile to avoid persona cross-contamination.
    // If getAccountProfile fails, retry once before falling back. Never silently use wrong persona.
    logger.info(`🧠 Generating AI message for Lead ${lead.id} via Account ${accountId}...`);
    let accountProfile = null;
    try {
      accountProfile = await whatsappManager.getAccountProfile(accountId);
    } catch (e) {
      logger.warn(`Account profile fetch failed for Account ${accountId}, retrying: ${e.message}`);
      try {
        accountProfile = await whatsappManager.getAccountProfile(accountId);
      } catch (e2) {
        logger.error(`Account profile fetch failed twice for Account ${accountId}: ${e2.message}`);
      }
    }

    if (!accountProfile) {
      logger.error(`⚠️ PERSONA SAFETY: Cannot get profile for Account ${accountId}. Aborting message generation to prevent persona leak.`);
      return;
    }

    logger.info(`✅ Persona locked: ${accountProfile.personaName} @ ${accountProfile.companyName} (Account ${accountId})`);

    if (accountProfile.maxFollowups) {
      await prisma.lead.update({
        where: { id: lead.id },
        data: { maxFollowups: accountProfile.maxFollowups },
      });
      lead.maxFollowups = accountProfile.maxFollowups;
    }

    const messages = composer.composeInitialMessage(lead, accountProfile);

    // Ensure we are working with an array
    const msgsToQueue = Array.isArray(messages) ? messages : [messages];

    // Create message records
    for (const [index, msgText] of msgsToQueue.entries()) {
      await prisma.message.create({
        data: {
          leadId: lead.id,
          direction: 'outbound',
          channel: 'whatsapp',
          content: msgText,
          waAccount: accountId,
          status: 'queued',
          // Space out the two messages by 5 seconds to simulate typing
          scheduledAt: new Date(Date.now() + (index * 5000)),
        },
      });
    }

    logger.info(`📋 Queued ${msgsToQueue.length} AI initial outreach messages for Lead ${lead.id} via WA Account ${accountId}`);
  }

  /**
   * Queue initial email outreach for a lead (when WhatsApp is unavailable).
   */
  async _queueInitialEmailOutreach(lead) {
    const currentLead = await prisma.lead.findUnique({ where: { id: lead.id } });
    if (!currentLead?.email) return { skipped: true, reason: 'no_email' };
    lead = currentLead;

    const automationKey = `email:fallback:initial:lead:${lead.id}`;
    const existing = await prisma.message.findFirst({
      where: {
        leadId: lead.id,
        direction: 'outbound',
        channel: 'email',
        OR: [
          { automationKey },
          {
            templateVariant: { contains: 'fallback' },
            status: { in: ['queued', 'sending', 'sent', 'delivered', 'read'] },
          },
        ],
      },
      orderBy: { createdAt: 'desc' },
    });
    if (existing) {
      logger.info(`📧 Initial email fallback already exists for Lead ${lead.id} as Message ${existing.id}`);
      return { skipped: true, reason: 'already_queued_or_sent', messageId: existing.id };
    }

    const emailAccountId = await emailService._getNextEmailAccount();
    if (!emailAccountId) {
      logger.warn(`📧 Cannot queue email outreach for Lead ${lead.id}: no email accounts available`);
      return;
    }

    // Resolve the brand persona to drive the LLM body. Returns null when neither
    // the lead nor the email account is mapped to a WhatsApp brand — in that case
    // we MUST refuse to send rather than fall through to the global "Outbound OS / Anaya" persona.
    const personaProfile = await emailService.getPersonaProfileForEmail(emailAccountId, lead);
    if (!personaProfile) {
      logger.warn(`📧 Skip initial email for Lead ${lead.id}: no brand persona mapped to email account ${emailAccountId}`);
      return;
    }

    logger.info(`📧 Composing email for Lead ${lead.id} as ${personaProfile.personaName} @ ${personaProfile.companyName}...`);
    const { subject, body, htmlBody, templateVariant } = composer.composeInitialEmail(lead, personaProfile);

    // Send-time optimizer: HOT leads go now; WARM/COLD respect the lead's local
    // business window so we don't drop into their inbox at 3 AM local time.
    const tier = lead.leadTier || 'WARM';
    let scheduledAt = new Date();
    if (tier !== 'HOT' && lead.country) {
      try {
        const { getOptimalSendTime } = await import('../utils/timezone.js');
        const optimal = getOptimalSendTime(lead.country);
        // If the optimal slot is more than 30 min away, schedule for then; otherwise send now.
        if (optimal.getTime() - scheduledAt.getTime() > 30 * 60 * 1000) {
          scheduledAt = new Date(optimal.getTime() + Math.random() * 10 * 60 * 1000);
        }
      } catch (_) { /* keep "now" */ }
    }

    await emailService.queueEmail({
      leadId: lead.id,
      accountId: emailAccountId,
      subject,
      body,
      htmlBody,
      scheduledAt,
      templateVariant,
      automationKey,
    });

    await prisma.lead.update({
      where: { id: lead.id },
      data: {
        // Preserve the terminal WhatsApp state so the undelivered-message
        // reaper cannot select the same lead again every 15 minutes.
        status: ['wa_undelivered', 'wa_unavailable'].includes(lead.status)
          ? lead.status
          : 'contacted',
        emailStatus: 'queued',
        assignedEmailAccountId: emailAccountId,
      },
    });

    logger.info(`📧 Queued AI email outreach for Lead ${lead.id} via Email Account ${emailAccountId} → ${scheduledAt.toISOString()}`);
  }

  /**
   * Check (with 30-day cache) whether a phone number is registered on WhatsApp.
   * Used as a pre-send gate so we don't burn a send slot or pay the 1-2s lookup
   * latency on numbers we already know are not on WhatsApp.
   *
   * Returns: true (registered), false (not registered), null (unknown — check
   * could not complete, e.g. all accounts disconnected). Callers should treat
   * null as "proceed and let the send path discover the truth".
   */
  async _prevalidateWhatsAppNumber(phone) {
    const digits = String(phone || '').replace(/\D/g, '');
    if (!digits) return null;
    const CACHE_TTL_MS = 30 * 24 * 60 * 60 * 1000;

    try {
      const cached = await prisma.whatsAppNumberCheck.findUnique({ where: { phone: digits } });
      if (cached && (Date.now() - new Date(cached.checkedAt).getTime()) < CACHE_TTL_MS) {
        return cached.isRegistered;
      }
    } catch (e) {
      logger.warn(`Pre-send cache lookup failed for *${digits.slice(-4)}: ${e.message}`);
    }

    const check = await whatsappManager.isNumberOnWhatsApp(phone);
    if (!check || check.result === null || check.result === undefined) {
      return null; // could not determine — proceed and let send path decide
    }

    try {
      await prisma.whatsAppNumberCheck.upsert({
        where: { phone: digits },
        update: { isRegistered: check.result, checkedAt: new Date(), accountId: check.accountId },
        create: { phone: digits, isRegistered: check.result, accountId: check.accountId },
      });
    } catch (e) {
      logger.warn(`Pre-send cache write failed for *${digits.slice(-4)}: ${e.message}`);
    }

    return check.result;
  }

  /**
   * Cron-driven reaper: find first-message WhatsApp sends that have been stuck
   * at single tick (ackStatus 0 or 1) for >24h, declare them undelivered,
   * cancel any queued WhatsApp follow-ups for that lead, and fall back to email
   * if the lead has one. This is the headline bulletproofing fix — without it,
   * the engine cheerfully queues a second message into a conversation the
   * recipient never received.
   *
   * Runs every 15 minutes from src/index.js.
   */
  async reapUndeliveredFirstMessages() {
    // Tightened from 24h → 4h. Users complained that the engine kept queueing
    // follow-ups into conversations where the very first message never reached
    // the device (single tick). 4h is long enough that genuine "phone off"
    // recipients still catch up; beyond that we assume the message will never
    // be delivered and switch the lead to email.
    const cutoff = new Date(Date.now() - 4 * 60 * 60 * 1000);
    let stuck;
    try {
      stuck = await prisma.message.findMany({
        where: {
          direction: 'outbound',
          channel: 'whatsapp',
          ackStatus: { in: [0, 1] },          // never reached the device
          sentAt: { lte: cutoff, not: null },
          lead: {
            status: { notIn: ['wa_undelivered', 'wa_unavailable', 'closed', 'replied', 'engaged'] },
            followupCount: 0,                  // only first messages count as "undelivered" — followups imply prior delivery
          },
        },
        include: { lead: true },
        take: 200,
      });
    } catch (e) {
      logger.error(`reapUndeliveredFirstMessages query failed: ${e.message}`);
      return;
    }

    if (!stuck || stuck.length === 0) return;
    logger.info(`📵 Reaper: found ${stuck.length} undelivered first-message lead(s) — halting WA follow-ups, switching to email where possible`);

    for (const m of stuck) {
      try {
        // Cancel every queued WA follow-up for this lead so the engine doesn't keep firing
        const cancelled = await prisma.message.updateMany({
          where: {
            leadId: m.leadId,
            status: 'queued',
            channel: 'whatsapp',
            direction: 'outbound',
          },
          data: { status: 'cancelled' },
        });

        // Flip the lead to wa_undelivered — distinct from wa_unavailable (which means
        // we KNOW the number isn't on WhatsApp); wa_undelivered means it might be,
        // but our message just isn't getting through.
        await prisma.lead.update({
          where: { id: m.leadId },
          data: { status: 'wa_undelivered', isOnWhatsApp: false },
        });

        // Email fallback — re-use the existing initial-email path
        if (m.lead.email) {
          try {
            await this._queueInitialEmailOutreach(m.lead);
            logger.warn(`📵→📧 Lead ${m.leadId} undelivered (single tick 24h+) — cancelled ${cancelled.count} queued WA msg(s), switched to email`);
          } catch (emailErr) {
            logger.warn(`📵→📧 Email fallback FAILED for Lead ${m.leadId}: ${emailErr.message} (queued WA cancelled, no recovery channel)`);
          }
        } else {
          logger.warn(`📵 Lead ${m.leadId} undelivered (single tick 24h+) — cancelled ${cancelled.count} queued WA msg(s), no email on file`);
        }
      } catch (e) {
        logger.error(`Reaper failed for Lead ${m.leadId}: ${e.message}`);
      }
    }
  }

  /**
   * Process the message queue with PRIORITY ordering.
   * Order: HOT leads first → WARM → COLD.
   * Account availability and provider errors are enforced by WhatsApp manager.
   */
  async processQueue({ messageIds = null } = {}) {
    if (this.running) return;
    this.running = true;

    // Determine if we are currently outside business hours
    const isBusinessHr = isBusinessHours(config.businessHours.start, config.businessHours.end);

    let deferredByBusinessHours = false;
    let processedAny = false;

    try {
      // Fetch pending messages that are due, JOIN with lead to get tier
      const pendingMessages = await prisma.message.findMany({
        where: {
          ...(Array.isArray(messageIds) ? { id: { in: messageIds } } : {}),
          status: 'queued',
          direction: 'outbound',
          channel: 'whatsapp',
          scheduledAt: { lte: new Date() },
        },
        include: { lead: true },
        orderBy: { scheduledAt: 'asc' },
        take: Array.isArray(messageIds) ? Math.max(1, messageIds.length) : 20,
      });

      if (pendingMessages.length === 0) return;

      let toProcess = pendingMessages;

      if (!isBusinessHr) {
        toProcess = pendingMessages.filter(msg => 
          (msg.lead.leadTier === 'HOT' || msg.lead.leadTier === 'WARM') && msg.lead.followupCount === 0
        );
        
        if (toProcess.length === 0) {
          logger.info('⏰ Outside business hours, skipping queue (no live leads waiting)');
          deferredByBusinessHours = true;
          this.running = false;
          return;
        }
        logger.info(`🔥 Outside business hours, but found ${toProcess.length} initial messages for HOT/WARM live leads! Sending instantly.`);
      }

      // ── Priority sort: HOT first, then WARM, then COLD ──
      const tierPriority = { HOT: 0, WARM: 1, COLD: 2 };
      const sorted = toProcess.sort((a, b) => {
        const pa = tierPriority[a.lead?.leadTier] ?? 1;
        const pb = tierPriority[b.lead?.leadTier] ?? 1;
        if (pa !== pb) return pa - pb;
        return new Date(a.scheduledAt) - new Date(b.scheduledAt); // earlier first within same tier
      });

      logger.info(`📤 Processing ${sorted.length} queued messages (priority sorted)...`);

      for (const msg of sorted) {
        let claimedMsg = null;
        try {
          // Atomic queue claim so reply/takeover cancellations can't be sent from stale in-memory snapshots.
          const claimed = await prisma.message.updateMany({
            where: {
              id: msg.id,
              status: 'queued',
              direction: 'outbound',
            },
            data: { status: 'sending' },
          });
          if (claimed.count === 0) continue;

          claimedMsg = await prisma.message.findUnique({
            where: { id: msg.id },
            include: { lead: true },
          });

          // Re-fetch lead state after claim to avoid stale decisions.
          const liveLead = await prisma.lead.findUnique({
            where: { id: claimedMsg.leadId },
          });

          if (!liveLead || leadStateService.shouldBlockAutomation(liveLead.status)) {
            logger.info(`⏭️ Lead ${claimedMsg.leadId} moved to ${liveLead?.status || 'missing'} before send; cancelling message ${claimedMsg.id}`);
            await prisma.message.updateMany({
              where: { id: claimedMsg.id, status: 'sending' },
              data: { status: 'cancelled' },
            });
            continue;
          }

          // ── PERSONA INTEGRITY CHECK ──
          // Verify the message will be sent from the correct account.
          // If waAccount is 0/null (unassigned), assign it to the lead's account.
          let sendAccountId = claimedMsg.waAccount || liveLead.assignedAccount;
          if (!sendAccountId) {
            sendAccountId = await whatsappManager.getNextAccount();
            if (sendAccountId) {
              logger.warn(`⚠️ Message ${claimedMsg.id} had no waAccount — assigned to Account ${sendAccountId}`);
            }
          }

          // If the message's waAccount doesn't match the lead's assignedAccount,
          // and both are set, this is a persona mismatch — regenerate the message.
          if (claimedMsg.waAccount && liveLead.assignedAccount &&
              claimedMsg.waAccount !== liveLead.assignedAccount) {
            logger.warn(`⚠️ PERSONA MISMATCH: Message ${claimedMsg.id} was generated for Account ${claimedMsg.waAccount} but lead is assigned to Account ${liveLead.assignedAccount}. Regenerating...`);
            try {
              const correctProfile = await whatsappManager.getAccountProfile(liveLead.assignedAccount);
              if (correctProfile) {
                const regenerated = composer.composeFollowupMessage(
                  liveLead,
                  liveLead.followupCount + 1,
                  correctProfile
                );
                claimedMsg.content = regenerated;
                sendAccountId = liveLead.assignedAccount;
                await prisma.message.update({
                  where: { id: claimedMsg.id },
                  data: { content: regenerated, waAccount: liveLead.assignedAccount },
                });
                logger.info(`✅ Regenerated message ${claimedMsg.id} with correct persona: ${correctProfile.personaName} @ ${correctProfile.companyName}`);
              }
            } catch (regenErr) {
              logger.error(`Failed to regenerate mismatched message ${claimedMsg.id}: ${regenErr.message}. Cancelling to prevent wrong persona send.`);
              await prisma.message.updateMany({
                where: { id: claimedMsg.id, status: 'sending' },
                data: { status: 'cancelled' },
              });
              continue;
            }
          }

          const isInitialOutreach = liveLead.followupCount === 0;
          // ── PRE-SEND NUMBER VALIDATION (initial outreach only) ──
          // Check if the phone is registered on WhatsApp BEFORE we burn a send slot.
          // Cached in WhatsAppNumberCheck table; re-checked after 30 days.
          // We only run this for the FIRST outreach — once a real send succeeds with
          // ack >= 1, we know the number is valid and skip the check for follow-ups.
          let sendResult;
          if (!claimedMsg.waCampaignName && isInitialOutreach && (claimedMsg.lead?.followupCount ?? 0) === 0) {
            const preCheck = await this._prevalidateWhatsAppNumber(liveLead.mobile);
            if (preCheck === false) {
              logger.warn(`📵 Pre-send check: Lead ${liveLead.id} (*${liveLead.mobile.slice(-4)}) is NOT on WhatsApp — short-circuiting send`);
              sendResult = { success: false, accountId: sendAccountId, reason: 'not_on_whatsapp' };
            }
          }

          if (!sendResult) {
            if (claimedMsg.waCampaignName) {
              let templateParams = [];
              try {
                templateParams = JSON.parse(claimedMsg.waTemplateParams || '[]');
              } catch {
                throw new Error(`Invalid template parameters on message ${claimedMsg.id}`);
              }
              sendResult = await whatsappManager.sendCampaignTemplate(
                liveLead.mobile,
                claimedMsg.waCampaignName,
                templateParams,
                sendAccountId,
                { poolId: liveLead.poolId, source: 'outboundos-fresh-lead' }
              );
            } else {
              sendResult = await whatsappManager.sendMessage(
                liveLead.mobile,
                claimedMsg.content,
                sendAccountId
              );
            }
          }

          if (sendResult.success) {
            processedAny = true;

            // Burn one slot from the account's new-lead budget. The
            // messagesSentToday counter is already incremented inside
            // whatsappManager.sendMessage(); this counter tracks the *initial
            // outreach* subset that gates getNextAccount({forInitialOutreach}).
            if (isInitialOutreach) {
              const acctId = sendResult.accountId || sendAccountId;
              if (acctId) {
                await prisma.whatsAppAccount.update({
                  where: { id: acctId },
                  data: { newLeadsContactedToday: { increment: 1 } },
                }).catch((e) => logger.warn(`Could not increment new-lead counter for Acct ${acctId}: ${e.message}`));
              }
            }

            if (Array.isArray(sendResult.identifiers) && sendResult.identifiers.length > 0) {
              replyDetector.rememberLeadIdentity(
                liveLead.id,
                sendResult.accountId || claimedMsg.waAccount || liveLead.assignedAccount || 1,
                sendResult.identifiers
              );
            }

            const sent = await prisma.message.updateMany({
              where: { id: claimedMsg.id, status: 'sending' },
              data: {
                status: 'sent',
                sentAt: new Date(),
                ...(sendResult.waMessageId ? { waMessageId: sendResult.waMessageId } : {}),
              },
            });
            if (sent.count === 0) continue;

            const remainingQueued = await prisma.message.count({
              where: {
                leadId: liveLead.id,
                status: 'queued',
                direction: 'outbound',
                channel: 'whatsapp',
              }
            });

            const postSendLead = await prisma.lead.findUnique({
              where: { id: liveLead.id },
            });

            if (!postSendLead || leadStateService.shouldBlockAutomation(postSendLead.status)) {
              logger.info(`🛑 Lead ${liveLead.id} moved to ${postSendLead?.status || 'missing'} during send; no further follow-up scheduling.`);
              continue;
            }

            // API Campaign rows are approved first-contact templates. Do not
            // synthesize an unrestricted Project API follow-up after them.
            if (claimedMsg.waCampaignName) {
              await prisma.lead.update({
                where: { id: postSendLead.id },
                data: { status: 'contacted', lastMessageAt: new Date() },
              });
              continue;
            }

            let newFollowupCount = postSendLead.followupCount;

            if (remainingQueued === 0) {
              newFollowupCount += 1;

              await prisma.lead.update({
                where: { id: postSendLead.id },
                data: {
                  followupCount: newFollowupCount,
                  lastMessageAt: new Date(),
                },
              });

              if (newFollowupCount < postSendLead.maxFollowups) {
                await this._scheduleNextFollowup(postSendLead, newFollowupCount);
              } else {
                logger.info(`🏁 Max follow-ups reached for Lead ${postSendLead.id}`);
                await prisma.lead.update({
                  where: { id: postSendLead.id },
                  data: { status: 'closed' },
                });
              }
            } else {
              await prisma.lead.update({
                where: { id: postSendLead.id },
                data: { lastMessageAt: new Date() },
              });
              logger.info(`⏳ Lead ${postSendLead.name} still has ${remainingQueued} msg(s) in queue, skipping follow-up schedule.`);
            }

            await randomDelay(config.whatsapp.minDelay, config.whatsapp.maxDelay);
            continue;
          }

          if (sendResult.reason === 'not_on_whatsapp' || sendResult.reason === 'invalid_phone') {
            await prisma.message.updateMany({
              where: { id: claimedMsg.id, status: 'sending' },
              data: {
                status: 'permanently_failed',
                retryCount: claimedMsg.maxRetries || 3,
              },
            });

            const cancelled = await prisma.message.updateMany({
              where: {
                leadId: claimedMsg.lead.id,
                status: 'queued',
                direction: 'outbound',
                channel: 'whatsapp',
              },
              data: { status: 'cancelled' },
            });

            await prisma.lead.update({
              where: { id: claimedMsg.lead.id },
              data: {
                isOnWhatsApp: false,
                status: 'wa_unavailable',
              },
            });

            logger.warn(`📵 Lead ${claimedMsg.lead.id} marked wa_unavailable (not on WhatsApp). Cancelled ${cancelled.count} queued WA msg(s).`);

            // ── Auto-fallback to email if lead has email ──
            if (claimedMsg.lead.email) {
              logger.info(`📧 Auto-falling back to email for Lead ${claimedMsg.lead.id}`);
              try {
                await this._queueInitialEmailOutreach(claimedMsg.lead);
              } catch (emailErr) {
                logger.warn(`📧 Email fallback failed for Lead ${claimedMsg.lead.id}: ${emailErr.message}`);
              }
            }
            continue;
          }

          const newRetryCount = (claimedMsg.retryCount || 0) + 1;
          const maxRetries = claimedMsg.maxRetries || 3;

          if (newRetryCount >= maxRetries) {
            await prisma.message.updateMany({
              where: { id: claimedMsg.id, status: 'sending' },
              data: { status: 'permanently_failed', retryCount: newRetryCount },
            });
            logger.error(`Message to Lead ${claimedMsg.lead.id} permanently failed after ${newRetryCount} retries`);
          } else {
            await prisma.message.updateMany({
              where: { id: claimedMsg.id, status: 'sending' },
              data: { status: 'queued', retryCount: newRetryCount }, // Re-queue it so the next run picks it up
            });
            logger.warn(`Failed to send message to Lead ${claimedMsg.lead.id} (retry ${newRetryCount}/${maxRetries})`);
          }
        } catch (msgError) {
          logger.error(`Queue message ${msg.id} failed: ${msgError.message}`);
          if (claimedMsg?.id) {
            const fallbackRetry = (claimedMsg.retryCount || 0) + 1;
            await prisma.message.updateMany({
              where: { id: claimedMsg.id, status: 'sending' },
              data: { status: 'queued', retryCount: fallbackRetry },
            }).catch(() => {});
          }
        }
      }

    } catch (error) {
      logger.error(`Follow-up engine error: ${error.message}`);
    } finally {
      this.running = false;
      
      // If there are more messages that became due while we were processing (like the 5s delay 2nd-part intro),
      // process them immediately instead of waiting for the 2-minute cron.
      try {
        const morePending = await prisma.message.count({
          where: {
            status: 'queued',
            direction: 'outbound',
            channel: 'whatsapp',
            scheduledAt: { lte: new Date() },
          }
        });
        if (!Array.isArray(messageIds) && morePending > 0 && processedAny && !deferredByBusinessHours) {
          setTimeout(() => this.processQueue(), 1000);
        }
      } catch (err) {
        // Ignore errors in final check
      }
    }
  }

  /**
   * Schedule the next follow-up message for a lead (tier-aware delays)
   *
   * Delay schedules (minutes):
   *   HOT  → [0, 240, 1440, 2880, 4320]  (5 follow-ups: now / 4hr / 24hr / 48hr / 72hr)
   *   WARM → [0, 1440, 2880, 4320]        (4 follow-ups: now / 24hr / 48hr / 72hr)
   *   COLD → [0, 4320]                    (2 follow-ups: now / 72hr — don't spam old leads)
   */
  async _scheduleNextFollowup(lead, currentCount) {
    const tier = lead.leadTier || 'WARM';

    // ── Per-account follow-up config (DB) with tier-based fallback ──
    let delays;
    if (lead.assignedAccount) {
      try {
        const acct = await prisma.whatsAppAccount.findFirst({ where: { id: lead.assignedAccount } });
        if (acct && acct.followupDelays) {
          delays = JSON.parse(acct.followupDelays);
        }
      } catch (e) { /* fall through to tier defaults */ }
    }

    // Tier-based fallback if no per-account config.
    // HOT: contact quickly while interest is fresh (2h → 12h → 24h → 48h)
    // WARM: standard daily cadence
    // COLD: light touch — don't spam leads that have gone quiet
    if (!delays) {
      const delayMap = {
        HOT:  [0, 120,  720,  1440, 2880],
        WARM: [0, 1440, 2880, 4320],
        COLD: [0, 4320],
      };
      delays = delayMap[tier] || delayMap.WARM;
    }

    const delayMinutes = delays[currentCount];

    if (delayMinutes === undefined) {
      logger.info(`No next follow-up for Lead ${lead.id} [${tier}] at step ${currentCount + 1}`);
      return;
    }

    // CRITICAL: Must get the correct account profile. Abort if profile fetch fails.
    const nextStep = currentCount + 1; // template step number
    let accountProfile = null;
    if (lead.assignedAccount) {
      try {
        accountProfile = await whatsappManager.getAccountProfile(lead.assignedAccount);
      } catch (e) {
        logger.warn(`Follow-up profile fetch failed for Account ${lead.assignedAccount}, retrying: ${e.message}`);
        try {
          accountProfile = await whatsappManager.getAccountProfile(lead.assignedAccount);
        } catch (e2) {
          logger.error(`Follow-up profile fetch failed twice for Account ${lead.assignedAccount}: ${e2.message}`);
        }
      }
    }

    if (!accountProfile && lead.assignedAccount) {
      logger.error(`⚠️ PERSONA SAFETY: Cannot get profile for Account ${lead.assignedAccount} during follow-up. Skipping follow-up to prevent persona leak.`);
      return;
    }

    // ── ACK-AWARE CHANNEL SWITCH ──
    // If the previous outbound WA send is stuck at single tick (ackStatus<2)
    // and ≥4h have passed since it was sent, the recipient's device clearly
    // isn't receiving. Don't burn another WA send slot — queue an email
    // follow-up instead (if we have an address). Lead stays active.
    const lastWaSend = await prisma.message.findFirst({
      where: { leadId: lead.id, direction: 'outbound', channel: 'whatsapp', status: 'sent' },
      orderBy: { sentAt: 'desc' },
      select: { ackStatus: true, sentAt: true },
    });

    if (lastWaSend && lastWaSend.sentAt &&
        (lastWaSend.ackStatus ?? 0) < 2 &&
        (Date.now() - new Date(lastWaSend.sentAt).getTime()) > 4 * 60 * 60 * 1000) {
      logger.warn(`📵→📧 Lead ${lead.id}: previous WA send stuck at ack=${lastWaSend.ackStatus ?? 0} for >4h — skipping WA follow-up #${nextStep}, routing to email`);
      if (lead.email) {
        try {
          await this._queueInitialEmailOutreach(lead);
        } catch (emailErr) {
          logger.warn(`📧 Email fallback failed for Lead ${lead.id}: ${emailErr.message}`);
        }
      } else {
        logger.info(`📵 Lead ${lead.id}: no email on file, parking until recipient device wakes`);
      }
      return;
    }

    const message = composer.composeFollowupMessage(lead, nextStep, accountProfile);

    // ── Timezone-aware scheduling ──
    // Base: now + delay minutes
    let scheduledAt = new Date(Date.now() + delayMinutes * 60 * 1000);

    // For delays >= 4 hours, snap to lead's optimal local send window
    // (avoids delivering at 3 AM in their timezone)
    if (delayMinutes >= 240 && lead.country) {
      try {
        const { getOptimalSendTime } = await import('../utils/timezone.js');
        const optimalBase = getOptimalSendTime(lead.country);
        if (optimalBase > scheduledAt) {
          scheduledAt = new Date(optimalBase.getTime() + Math.random() * 10 * 60 * 1000);
        }
      } catch (e) { /* fallback to delay-based time */ }
    }

    await prisma.message.create({
      data: {
        leadId: lead.id,
        direction: 'outbound',
        channel: 'whatsapp',
        content: message,
        waAccount: lead.assignedAccount,
        status: 'queued',
        scheduledAt,
      },
    });

    logger.info(`⏰ [${tier}] WA Follow-up ${nextStep} for Lead ${lead.id} → ${scheduledAt.toISOString()}`);

    // ── Cross-channel: queue an email follow-up once WA follow-up 1 has gone out
    // (lowered from >= 2 to >= 1 to better utilise the daily Brevo email quota) ──
    if (lead.email && currentCount >= 1 && lead.emailFollowupCount < 3) {
      try {
        const emailAccountId = lead.assignedEmailAccountId || await emailService._getNextEmailAccount();
        if (!emailAccountId) {
          logger.warn(`📧 [${tier}] No email account available for cross-channel follow-up on Lead ${lead.id}`);
        } else {
          // Resolve persona — refuse to send rather than leak the global "Anaya / Outbound OS" persona.
          const personaProfile = await emailService.getPersonaProfileForEmail(emailAccountId, lead);
          if (!personaProfile) {
            logger.warn(`📧 [${tier}] Skip email follow-up for Lead ${lead.id}: no brand persona mapped to email account ${emailAccountId}`);
          } else {
            // Pull the prior outbound email so we can thread (In-Reply-To) and reuse the subject.
            const prevEmail = await prisma.message.findFirst({
              where: { leadId: lead.id, direction: 'outbound', channel: 'email', status: { in: ['sent', 'queued', 'sending'] } },
              orderBy: { createdAt: 'desc' },
              select: { emailMessageId: true, emailSubject: true, content: true },
            });
            const threadContext = {
              previousSubject: prevEmail?.emailSubject || null,
              previousMessageId: prevEmail?.emailMessageId || null,
            };
            const followupIndex = (lead.emailFollowupCount || 0) + 2; // 2 = first follow-up email
            const emailResult = composer.composeFollowupEmail(lead, followupIndex, personaProfile);

            // Schedule for the lead's local business window. For very HOT leads,
            // honour the WA cadence (now + 30 min) so we don't delay an active conversation.
            let emailScheduledAt = new Date(scheduledAt.getTime() + 30 * 60 * 1000);
            if (tier !== 'HOT') {
              try {
                const { getOptimalSendTime } = await import('../utils/timezone.js');
                const optimal = getOptimalSendTime(lead.country);
                if (optimal > emailScheduledAt) {
                  emailScheduledAt = new Date(optimal.getTime() + Math.random() * 10 * 60 * 1000);
                }
              } catch (_) { /* keep WA-derived time */ }
            }

            await emailService.queueEmail({
              leadId: lead.id,
              accountId: emailAccountId,
              subject: emailResult.subject,
              body: emailResult.body,
              htmlBody: emailResult.htmlBody,
              scheduledAt: emailScheduledAt,
              inReplyTo: threadContext.previousMessageId,
              templateVariant: emailResult.templateVariant,
            });
            logger.info(`📧 [${tier}] Email follow-up #${followupIndex} queued for Lead ${lead.id} as ${personaProfile.personaName} @ ${personaProfile.companyName} → ${emailScheduledAt.toISOString()}${threadContext.previousMessageId ? ' (threaded)' : ''}`);
          }
        }
      } catch (emailErr) {
        logger.warn(`📧 Email follow-up queueing failed for Lead ${lead.id}: ${emailErr.message}`);
      }
    }
  }

  /**
   * Retry permanently-failed messages (called periodically).
   * Only retries messages that failed due to transient errors (e.g. WA not ready),
   * not those that exceeded max retries completely.
   */
  /**
   * Re-queue transiently-failed messages.
   *
   * Delegates the decision to deliveryRetry, which classifies each failure
   * before acting. The previous implementation retried any row with
   * status='failed' and then wrote `retryCount: 0` back — so the `< 3` guard
   * never advanced and a message could retry every five minutes indefinitely.
   * Against Meta's quality throttle (the most common retryable failure here)
   * that is the exact behaviour that deepens the throttle and lowers the
   * sender rating, making delivery worse the harder it tries.
   *
   * Now: only RETRYABLE classifications, a real incrementing attempt count,
   * and 6h/24h/72h jittered backoff. Opt-outs and permanent failures are
   * never re-sent.
   */
  async retryFailed() {
    // Reports only. Outbound is operator- or agent-initiated by design, so
    // nothing here dispatches on a timer — the sweep surfaces what is eligible
    // and dispatch happens through a campaign or the MCP tools.
    const result = await deliveryRetry.sweep({ channel: 'whatsapp', limit: 100, dryRun: true });
    if (result.due > 0) {
      logger.info(`🔁 ${result.due} message(s) eligible for redelivery — trigger a retry campaign to send`);
    }
    return result;
  }

  /**
   * Get follow-up stats
   */
  async getStats() {
    const total = await prisma.lead.count();
    const contacted = await prisma.lead.count({ where: { status: 'contacted' } });
    const replied = await prisma.lead.count({ where: { status: 'replied' } });
    const closed = await prisma.lead.count({ where: { status: 'closed' } });
    const newLeads = await prisma.lead.count({ where: { status: 'new' } });
    const pendingMessages = await prisma.message.count({ where: { status: 'queued' } });

    return { total, newLeads, contacted, replied, closed, pendingMessages };
  }
}

export default new FollowupEngine();
