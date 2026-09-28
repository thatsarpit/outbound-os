import prisma from '../utils/prismaClient.js';
import { isBsuid } from '../utils/whatsappAddress.js';
import logger from '../utils/logger.js';
import leadScorer from './leadScorer.js';
import activityLog, { EVENT_TYPES } from '../utils/activityLog.js';
import leadStateService, { LEAD_STATUS } from '../domain/leadStateService.js';
import interventionEngine from './interventionEngine.js';
import { classifyReply } from './replyClassifier.js';
import webhookDispatcher from './webhookDispatcher.js';
import sheetsSync from './sheetsSync.js';
import fs from 'fs';
import path from 'path';

/**
 * Reply Detector v4
 * - Direct phone query (no O(n) full-table scan)
 * - Never auto-sends on inbound reply (human takeover safety)
 * - Auto-promotes replied → engaged on 2+ replies
 * - Recalculates lead score on every reply
 */
class ReplyDetector {
  constructor() {
    this.identityToLead = new Map();
    this.identityTtlMs = 14 * 24 * 60 * 60 * 1000;
    this.maxIdentityEntries = 10000;
    this.identityPersistPath = path.resolve(process.cwd(), 'data', 'reply-identities.json');
    this._persistTimer = null;
    this._loadIdentityMapFromDisk();
  }

  _normalizeDigits(value) {
    if (!value) return '';
    return String(value).replace(/\D/g, '');
  }

  _identityKey(accountId, digits) {
    return `${accountId}:${digits}`;
  }

  _pruneIdentityMap() {
    const cutoff = Date.now() - this.identityTtlMs;
    for (const [key, entry] of this.identityToLead.entries()) {
      if (!entry || entry.seenAt < cutoff) this.identityToLead.delete(key);
    }

    if (this.identityToLead.size > this.maxIdentityEntries) {
      const sorted = [...this.identityToLead.entries()].sort((a, b) => (b[1]?.seenAt || 0) - (a[1]?.seenAt || 0));
      this.identityToLead = new Map(sorted.slice(0, this.maxIdentityEntries));
    }
  }

  _loadIdentityMapFromDisk() {
    try {
      if (!fs.existsSync(this.identityPersistPath)) return;
      const raw = fs.readFileSync(this.identityPersistPath, 'utf8');
      if (!raw) return;
      const payload = JSON.parse(raw);
      const now = Date.now();
      for (const [key, entry] of Object.entries(payload || {})) {
        if (!entry?.leadId || !entry?.seenAt) continue;
        if (now - entry.seenAt > this.identityTtlMs) continue;
        this.identityToLead.set(key, { leadId: entry.leadId, seenAt: entry.seenAt });
      }
      this._pruneIdentityMap();
      logger.info(`Loaded ${this.identityToLead.size} reply identities from disk`);
    } catch (error) {
      logger.warn(`Failed to load reply identities: ${error.message}`);
    }
  }

  _schedulePersistIdentityMap() {
    if (this._persistTimer) clearTimeout(this._persistTimer);
    this._persistTimer = setTimeout(async () => {
      try {
        this._pruneIdentityMap();
        const payload = {};
        for (const [key, entry] of this.identityToLead.entries()) {
          payload[key] = entry;
        }
        await fs.promises.mkdir(path.dirname(this.identityPersistPath), { recursive: true });
        await fs.promises.writeFile(this.identityPersistPath, JSON.stringify(payload), 'utf8');
      } catch (error) {
        logger.warn(`Failed to persist reply identities: ${error.message}`);
      }
    }, 1500);
  }

  _bindLeadIdentities(leadId, accountId, identifiers = []) {
    if (!leadId || !accountId || !Array.isArray(identifiers)) return;
    const now = Date.now();
    let changed = false;
    for (const raw of identifiers) {
      const digits = this._normalizeDigits(raw);
      if (digits.length < 8 || digits.length > 16) continue;
      this.identityToLead.set(this._identityKey(accountId, digits), { leadId, seenAt: now });
      this.identityToLead.set(this._identityKey('any', digits), { leadId, seenAt: now });
      changed = true;
    }
    this._pruneIdentityMap();
    if (changed) this._schedulePersistIdentityMap();
  }

  rememberLeadIdentity(leadId, accountId, identifiers = []) {
    this._bindLeadIdentities(leadId, accountId, identifiers);
  }

  async _findLeadByIdentity(candidates, accountId) {
    this._pruneIdentityMap();
    for (const candidate of candidates) {
      const digits = this._normalizeDigits(candidate);
      if (digits.length < 8 || digits.length > 16) continue;
      const scoped = this.identityToLead.get(this._identityKey(accountId, digits));
      const global = this.identityToLead.get(this._identityKey('any', digits));
      const mapped = scoped || global;
      if (!mapped?.leadId) continue;
      const lead = await prisma.lead.findUnique({
        where: { id: mapped.leadId },
        include: {
          messages: {
            orderBy: { createdAt: 'desc' },
            take: 6,
          },
        },
      });
      if (lead) return lead;
    }
    return null;
  }

  _buildCandidates(fromPhone, meta = {}) {
    const candidates = new Set();
    const add = (value) => {
      const digits = this._normalizeDigits(value);
      if (digits.length >= 8 && digits.length <= 16) {
        candidates.add(digits);
      }
    };

    add(fromPhone);
    add(meta.rawFrom);
    if (Array.isArray(meta.candidatePhones)) {
      for (const candidate of meta.candidatePhones) add(candidate);
    }

    // Most lead numbers are stored with full country code. We still use last-10 matching later.
    return [...candidates];
  }

  async _findLead(candidates, accountId) {
    const last10List = [...new Set(
      candidates
        .filter(c => c.length >= 10)
        .map(c => c.slice(-10))
    )];

    if (last10List.length === 0) return null;

    const leads = await prisma.lead.findMany({
      where: {
        OR: last10List.map(last10 => ({ mobile: { endsWith: last10 } })),
        status: { in: ['contacted', 'new', 'replied', 'engaged', 'paused', 'closed', 'wa_unavailable'] },
      },
      include: {
        messages: {
          orderBy: { createdAt: 'desc' },
          take: 6,
        },
      },
      take: 20,
    });

    if (leads.length === 0) {
      return this._findLeadByIdentity(candidates, accountId);
    }
    if (leads.length === 1) {
      this._bindLeadIdentities(leads[0].id, accountId, candidates);
      return leads[0];
    }

    const rankLead = (lead) => {
      let score = 0;
      const mobileDigits = this._normalizeDigits(lead.mobile);
      const last10 = mobileDigits.slice(-10);
      if (last10List.includes(last10)) score += 3;
      if (lead.assignedAccount === accountId) score += 3;
      if (lead.lastMessageAt) score += 2;
      if (lead.status === 'contacted' || lead.status === 'replied' || lead.status === 'engaged') score += 1;
      return score;
    };

    leads.sort((a, b) => {
      const scoreDiff = rankLead(b) - rankLead(a);
      if (scoreDiff !== 0) return scoreDiff;
      const aTime = new Date(a.lastMessageAt || a.updatedAt || a.createdAt).getTime();
      const bTime = new Date(b.lastMessageAt || b.updatedAt || b.createdAt).getTime();
      return bTime - aTime;
    });

    const matched = leads[0];
    this._bindLeadIdentities(matched.id, accountId, candidates);
    return matched;
  }

  async _resolveInboundPoolId(channel, accountId) {
    if (channel === 'whatsapp' && accountId) {
      const link = await prisma.leadPoolWhatsApp.findFirst({
        where: { whatsappAccountId: Number(accountId) },
        orderBy: { poolId: 'asc' },
        select: { poolId: true },
      });
      if (link?.poolId) return link.poolId;
    }
    const pool = await prisma.leadPool.findFirst({
      orderBy: [{ isDefault: 'desc' }, { id: 'asc' }],
      select: { id: true },
    });
    return pool?.id || null;
  }

  /**
   * Keep a lead's WhatsApp user id and username current, so a later message
   * that carries only the user id — no number — still finds this lead.
   */
  async _rememberWhatsAppUser(lead, waUserId, waUsername) {
    const username = waUsername ? String(waUsername).slice(0, 100) : null;
    const data = {
      ...(lead.waUserId !== waUserId ? { waUserId } : {}),
      ...(username && lead.waUsername !== username ? { waUsername: username } : {}),
    };
    if (Object.keys(data).length === 0) return;
    try {
      await prisma.lead.update({ where: { id: lead.id }, data });
    } catch (error) {
      // Another lead already holds this user id (two records for one person).
      // Leave both as they are rather than guess which to merge.
      if (error?.code === 'P2002') {
        logger.warn(`WhatsApp user id *${waUserId.slice(-4)} already belongs to another lead; not moved to Lead ${lead.id}`);
        return;
      }
      throw error;
    }
  }

  async _createInboundLead(candidates, accountId, channel, meta = {}) {
    const number = [...candidates]
      .map((candidate) => this._normalizeDigits(candidate))
      .filter((candidate) => candidate.length >= 8 && candidate.length <= 16)
      .sort((a, b) => b.length - a.length)[0];
    // A WhatsApp user known only by their business-scoped user id still gets
    // a lead. Lead.mobile is required and unique, so it carries the same
    // non-numeric `no-phone:` placeholder email-only leads use; replies are
    // addressed to waUserId instead.
    const waUserId = channel === 'whatsapp' && isBsuid(meta.waUserId) ? String(meta.waUserId).trim() : null;
    if (!number && !waUserId) return null;
    const mobile = number || `no-phone:${waUserId}`;
    const waIdentity = waUserId
      ? { waUserId, ...(meta.waUsername ? { waUsername: String(meta.waUsername).slice(0, 100) } : {}) }
      : {};

    const poolId = await this._resolveInboundPoolId(channel, accountId);
    const channelLabel = channel === 'imessage'
      ? 'iMessage'
      : channel === 'email'
        ? 'Email'
        : 'WhatsApp';
    const senderName = String(meta.senderName || '').trim();
    const fallbackName = number
      ? `${channelLabel} contact · ${number.slice(-4)}`
      : meta.waUsername
        ? `@${String(meta.waUsername).slice(0, 60)}`
        : `${channelLabel} user · ${waUserId.slice(-4)}`;
    try {
      return await prisma.lead.create({
        data: {
          name: senderName || fallbackName,
          mobile,
          ...waIdentity,
          source: `${channel}_inbound`,
          status: 'new',
          poolId,
          assignedAccount: channel === 'whatsapp' ? (Number(accountId) || 0) : 0,
          assignedIMessageAccountId: channel === 'imessage' ? (Number(accountId) || null) : null,
          tags: `inbound, ${channel}`,
        },
        include: {
          messages: {
            orderBy: { createdAt: 'desc' },
            take: 6,
          },
        },
      });
    } catch (error) {
      // A simultaneous duplicate webhook can race the globally-unique mobile
      // constraint. Re-fetch the winner instead of losing the conversation.
      if (error?.code === 'P2002') {
        return prisma.lead.findFirst({
          where: { mobile },
          include: {
            messages: {
              orderBy: { createdAt: 'desc' },
              take: 6,
            },
          },
        });
      }
      throw error;
    }
  }

  /**
   * Handle an incoming reply
   * @param {string} fromPhone - Sender identifier (phone/lid jid user part)
   * @param {string} messageBody - Message content
   * @param {number} accountId - Which WA account received it (1 or 2)
   * @param {object} meta - Optional metadata (rawFrom, candidatePhones)
   */
  async handleReply(fromPhone, messageBody, accountId, meta = {}) {
    try {
      const channel = ['whatsapp', 'email', 'imessage'].includes(meta.channel)
        ? meta.channel
        : 'whatsapp';
      // WhatsApp users on a username may arrive with only a business-scoped
      // user id and no number (see utils/whatsappAddress.js).
      const waUserId = channel === 'whatsapp' && isBsuid(meta.waUserId) ? String(meta.waUserId).trim() : null;
      if ((!fromPhone || typeof fromPhone !== 'string') && !waUserId) {
        logger.warn('handleReply called with invalid fromPhone');
        return;
      }
      if (typeof fromPhone !== 'string') fromPhone = '';

      const candidates = this._buildCandidates(fromPhone, meta);
      let lead = meta.leadId
        ? await prisma.lead.findUnique({
            where: { id: Number(meta.leadId) },
            include: { messages: { orderBy: { createdAt: 'desc' }, take: 6 } },
          })
        : null;
      if (!lead && waUserId) {
        lead = await prisma.lead.findUnique({
          where: { waUserId },
          include: { messages: { orderBy: { createdAt: 'desc' }, take: 6 } },
        });
      }
      if (!lead && !meta.leadId) lead = await this._findLead(candidates, accountId);

      if (!lead) {
        lead = await this._createInboundLead(candidates, accountId, channel, meta);
        if (!lead) {
          const masked = candidates.map(c => `*${c.slice(-4)}`).join(', ') || 'none';
          logger.info(`📥 Incoming ${channel} from ${meta.rawFrom || fromPhone} [ids: ${masked}] — no usable identity`);
          activityLog.add(
            EVENT_TYPES.SYSTEM_ERROR,
            `Unmatched inbound on ${channel} (${masked})`,
            { accountId, channel, from: meta.rawFrom || fromPhone, candidates: masked }
          );
          return;
        }
        logger.info(`➕ Created Lead ${lead.id} from unmatched inbound ${channel}`);
      }

      this._bindLeadIdentities(lead.id, accountId, candidates);
      if (waUserId) await this._rememberWhatsAppUser(lead, waUserId, meta.waUsername);

      const inboundWhere = { leadId: lead.id, direction: 'inbound' };
      const [inboundCount, previousInbound] = await Promise.all([
        prisma.message.count({ where: inboundWhere }),
        prisma.message.findFirst({
          where: inboundWhere,
          orderBy: [{ sentAt: 'desc' }, { createdAt: 'desc' }],
          select: { sentAt: true, createdAt: true },
        }),
      ]);
      const isFirstReply = !lead.repliedAt && (lead.status === 'contacted' || lead.status === 'new');
      const body = String(messageBody || '');
      const receivedAt = new Date();
      const rawProviderTime = meta.providerCreatedAt || meta.timestamp || null;
      const parsedProviderTime = rawProviderTime
        ? new Date(rawProviderTime)
        : null;
      const providerEventAt =
        parsedProviderTime &&
        !Number.isNaN(parsedProviderTime.getTime()) &&
        parsedProviderTime <= new Date(receivedAt.getTime() + 5 * 60_000)
          ? parsedProviderTime
          : null;
      const eventAt = providerEventAt || receivedAt;

      logger.info(`🎉 REPLY from Lead ${lead.id} (*${this._normalizeDigits(lead.mobile).slice(-4)}): [Length: ${body.length}]`);

      if (channel === 'imessage' && meta.messageId) {
        const existing = await prisma.message.findFirst({
          where: { imessageMessageId: String(meta.messageId) },
          select: { id: true },
        });
        if (existing) {
          logger.info(`🔁 Duplicate iMessage webhook ${meta.messageId} - skipping`);
          return;
        }
      }

      if (channel === 'whatsapp' && meta.messageId) {
        const existing = await prisma.message.findFirst({
          where: { waMessageId: String(meta.messageId), direction: 'inbound' },
          select: { id: true },
        });
        if (existing) {
          logger.info(`🔁 Duplicate WhatsApp webhook ${meta.messageId} - skipping`);
          return;
        }
      }

      // ── Webhook dedup — same lead + same content within 60 seconds = duplicate fire ──
      const dedupWindow = new Date(Date.now() - 60_000);
      const duplicate = await prisma.message.findFirst({
        where: {
          leadId: lead.id,
          direction: 'inbound',
          content: body,
          createdAt: { gte: dedupWindow },
        },
        select: { id: true },
      });
      if (duplicate) {
        logger.info(`🔁 Duplicate inbound for Lead ${lead.id} within 60s — skipping`);
        return;
      }

      // ── Record the incoming message ──
      await prisma.message.create({
        data: {
          leadId: lead.id,
          direction: 'inbound',
          channel,
          content: body,
          waAccount: channel === 'whatsapp' ? (accountId || 0) : 0,
          waMessageId: channel === 'whatsapp' ? (meta.messageId || null) : null,
          imessageAccountId: channel === 'imessage' ? (accountId || null) : null,
          imessageMessageId: channel === 'imessage' ? (meta.messageId || null) : null,
          providerCreatedAt: providerEventAt,
          status: 'delivered',
          sentAt: eventAt,
        },
      });

      // ── Determine new status ──
      // First reply → 'replied'
      // 2+ replies → engaged, while preserving paused takeover locks.
      const newStatus = leadStateService.computeInboundStatus(lead.status, inboundCount);
      if (!leadStateService.ensureTransition(lead.status, newStatus, 'replyDetector.handleReply')) {
        return;
      }

      // ── Update lead status ──
      await prisma.lead.update({
        where: { id: lead.id },
        data: {
          status: newStatus,
          repliedAt: isFirstReply ? eventAt : lead.repliedAt || eventAt,
          lastMessageAt:
            !lead.lastMessageAt || eventAt > lead.lastMessageAt
              ? eventAt
              : lead.lastMessageAt,
          ...(channel === 'imessage' ? { imessageStatus: 'replied', lastImessageAt: eventAt } : {}),
        },
      });

      // Attribute the reply to the most recent campaign that actually sent to
      // this lead since its previous inbound message. Without the lower bound,
      // a second reply can falsely credit an older campaign that was already
      // sent before the first reply. Later campaigns can still earn a reply.
      const previousReplyAt = previousInbound?.sentAt || previousInbound?.createdAt;
      const campaignAttribution = await prisma.campaignLead.findFirst({
        where: {
          leadId: lead.id,
          status: 'sent',
          sentAt: {
            lte: eventAt,
            ...(previousReplyAt ? { gt: previousReplyAt } : {}),
          },
        },
        select: { id: true, campaignId: true, variant: true },
        orderBy: { sentAt: 'desc' },
      });
      if (campaignAttribution) {
        const variantReplyField =
          campaignAttribution.variant === 'B'
            ? 'variantBReplies'
            : 'variantAReplies';
        await prisma.$transaction([
          prisma.campaignLead.update({
            where: { id: campaignAttribution.id },
            data: { status: 'replied' },
          }),
          prisma.campaign.update({
            where: { id: campaignAttribution.campaignId },
            data: {
              replyCount: { increment: 1 },
              [variantReplyField]: { increment: 1 },
            },
          }),
        ]);
      }

      // ── Cancel pending follow-ups ──
      const cancelled = await prisma.message.updateMany({
        where: {
          leadId: lead.id,
          status: 'queued',
          direction: 'outbound',
        },
        data: { status: 'cancelled' },
      });

      if (cancelled.count > 0) {
        logger.info(`🛑 Cancelled ${cancelled.count} pending follow-up(s) for ${lead.name}`);
      }

      // ── Recalculate lead score ──
      const newScore = await leadScorer.calculateScore(lead.id);
      logger.info(`📊 ${lead.name} re-scored: ${newScore}/100 (status: ${newStatus})`);
      activityLog.add(
        EVENT_TYPES.REPLY_RECEIVED,
        `Reply from ${lead.name} (*${this._normalizeDigits(lead.mobile).slice(-4)})`,
        { leadId: lead.id, accountId, channel }
      );

      // ── Smart Intervention — analyze reply for buying/negative signals ──
      const updatedLead = await prisma.lead.findUnique({ where: { id: lead.id } });
      if (updatedLead) {
        try {
          await interventionEngine.analyzeReply(updatedLead, body, channel);
        } catch (intErr) {
          logger.warn(`Intervention analysis failed for Lead ${lead.id}: ${intErr.message}`);
        }
      }

      // ── Reply classification (fire-and-forget, non-blocking) ──
      setImmediate(async () => {
        try {
          const classification = classifyReply(lead, body);
          if (classification) {
            await prisma.lead.update({
              where: { id: lead.id },
              data: {
                lastReplyIntent: classification.intent,
                aiInsights: JSON.stringify({
                  ...classification,
                  channel,
                  detectedAt: new Date().toISOString(),
                }),
              },
            });
            // Auto-pause for definitive negative/opt-out replies
            const NEGATIVE_INTENTS = ['negative', 'complaint'];
            if (NEGATIVE_INTENTS.includes(classification.intent)) {
              try {
                const cancelled = await prisma.message.updateMany({
                  where: { leadId: lead.id, status: 'queued' },
                  data: { status: 'cancelled' },
                });
                await prisma.lead.update({
                  where: { id: lead.id },
                  data: { status: 'paused' },
                });
                logger.info(`⏸️  Lead ${lead.id} auto-paused (intent: ${classification.intent}); cancelled ${cancelled.count} queued message(s)`);
              } catch (pauseErr) {
                logger.warn(`Auto-pause failed for Lead ${lead.id}: ${pauseErr.message}`);
              }
            }

            // Out-of-office: cancel current queue and reschedule a follow-up
            // for 7 days out instead of pausing the lead permanently.
            // The delayed follow-up worker currently sends WhatsApp messages only.
            if (classification.intent === 'out_of_office' && channel === 'whatsapp') {
              try {
                const cancelled = await prisma.message.updateMany({
                  where: { leadId: lead.id, status: 'queued' },
                  data: { status: 'cancelled' },
                });
                const resumeAt = new Date(Date.now() + 7 * 24 * 60 * 60 * 1000);
                // Queue a single follow-up 7 days from now — the engine will pick up
                // normal scheduling from there once the lead re-engages.
                await prisma.message.create({
                  data: {
                    leadId: lead.id,
                    direction: 'outbound',
                    channel,
                    content: '[OOO follow-up — composed from template at send time]',
                    waAccount: lead.assignedAccount || 0,
                    status: 'queued',
                    scheduledAt: resumeAt,
                  },
                });
                logger.info(`📅 Lead ${lead.id} OOO — cancelled ${cancelled.count} queued message(s), rescheduled follow-up for ${resumeAt.toDateString()}`);
              } catch (oooErr) {
                logger.warn(`OOO reschedule failed for Lead ${lead.id}: ${oooErr.message}`);
              }
            }

            // Dispatch webhook event
            await webhookDispatcher.dispatch('lead.replied', {
              leadId: lead.id, name: lead.name, intent: classification.intent,
              urgency: classification.urgency, nextAction: classification.nextAction,
              summary: classification.summary, channel,
            });
            sheetsSync.dispatch('lead.replied', lead).catch(() => {});
          }
        } catch (err) {
          logger.warn(`Background classification failed for Lead ${lead.id}: ${err.message}`);
        }
      });

      logger.info(`🧑‍💼 Inbound received for Lead ${lead.id}; auto-reply is disabled (manual takeover mode).`);

      logger.info(`🤝 Lead ${lead.name} → ${newStatus} (ready for follow-up or manual takeover)`);

    } catch (error) {
      logger.error(`Reply detection error: ${error.message}`);
      throw error;
    }
  }

  async handleManualOutbound(toPhone, messageBody, accountId, meta = {}) {
    try {
      const body = String(messageBody || '').trim();
      if (!body) return;

      const candidates = this._buildCandidates(toPhone, meta);
      const lead = await this._findLead(candidates, accountId);
      if (!lead) {
        const masked = candidates.map(c => `*${c.slice(-4)}`).join(', ') || 'none';
        logger.info(`✍️ Manual outbound on WA${accountId} [ids: ${masked}] — no matching lead`);
        return;
      }

      this._bindLeadIdentities(lead.id, accountId, candidates);

      const duplicate = await prisma.message.findFirst({
        where: {
          leadId: lead.id,
          direction: 'outbound',
          waAccount: accountId,
          status: 'sent',
          content: body,
          createdAt: { gte: new Date(Date.now() - 90 * 1000) },
        },
        orderBy: { createdAt: 'desc' },
      });
      if (!duplicate) {
        await prisma.message.create({
          data: {
            leadId: lead.id,
            direction: 'outbound',
            content: body,
            waAccount: accountId,
            status: 'sent',
            sentAt: new Date(),
          },
        });
      }

      const cancelled = await prisma.message.updateMany({
        where: {
          leadId: lead.id,
          status: 'queued',
          direction: 'outbound',
        },
        data: { status: 'cancelled' },
      });

      const wasPaused = lead.status === LEAD_STATUS.PAUSED;
      const takeoverStatus = leadStateService.computeManualTakeoverStatus(lead.status);
      if (!leadStateService.ensureTransition(lead.status, takeoverStatus, 'replyDetector.handleManualOutbound')) {
        return;
      }
      await prisma.lead.update({
        where: { id: lead.id },
        data: {
          status: takeoverStatus,
          isOnWhatsApp: true,
          assignedAccount: lead.assignedAccount || accountId,
          lastMessageAt: new Date(),
        },
      });

      if (!wasPaused) {
        activityLog.add(
          EVENT_TYPES.LEAD_TAKEOVER,
          `Manual takeover: ${lead.name} (*${this._normalizeDigits(lead.mobile).slice(-4)})`,
          { leadId: lead.id, accountId }
        );
      }

      logger.info(`🧑‍💼 Lead ${lead.id} paused via manual outbound on WA${accountId}. Cancelled ${cancelled.count} queued msg(s).`);
    } catch (error) {
      logger.error(`Manual outbound handling error: ${error.message}`);
    }
  }
}

export default new ReplyDetector();
