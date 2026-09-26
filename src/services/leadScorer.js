import prisma from '../utils/prismaClient.js';
import logger from '../utils/logger.js';
import { computeLeadTier } from '../domain/leadTier.js';

/**
 * Lead Scoring Engine v3
 * Calculates a 0-100 composite score with POSITIVE signals, NEGATIVE signals, and TIME DECAY.
 *
 * Score = Positive - Negative - Decay (clamped 0-100)
 *
 * Positive (max ~80):
 *   +30 Replied on 1st outreach   +15 Reply speed < 1hr
 *   +22 Replied on 2nd outreach   +10 Reply speed 1-4hr
 *   +15 Replied on 3rd outreach   +10 Asks pricing
 *   +8  Replied 4th/5th           +8  Asks shipping
 *   +5  Per extra reply           +5  Has quantity specified
 *   +5  Has company               +3  Has email
 *
 * Negative (subtract):
 *   -5  Per unanswered follow-up (max -25)
 *   -10 WhatsApp number invalid / messages permanently failed
 *   -15 Ghost lead: 5+ messages sent, 0 replies
 *
 * Time Decay:
 *   -1 per week since last activity (max -20)
 */
class LeadScorer {

  static SCORING = {
    replyOnFirstOutreach: 30,
    replyOnSecondOutreach: 22,
    replyOnThirdOutreach: 15,
    replyOnFourthOrFifthOutreach: 8,

    replySpeedFast: 15,
    replySpeedMedium: 10,
    replySpeedSlow: 5,

    hasCompany: 5,
    hasEmail: 3,
    hasQuantity: 5,

    asksPricing: 10,
    asksShipping: 8,
    asksAvailability: 6,
    multipleReplies: 5,

    highValueCountry: 5,

    // Email-specific signals
    emailReply: 8,                // Replied via email (in addition to reply points)
    multiChannelEngagement: 10,   // Replied on both WA and email

    // Negative signals
    perUnansweredFollowup: -5,
    maxUnansweredPenalty: -25,
    waNumberInvalid: -10,
    messagesPermanentlyFailed: -10,
    ghostLead: -15,         // 5+ sent, 0 replies

    // Decay
    decayPerWeek: -1,
    maxDecay: -20,
  };

  static HIGH_VALUE_COUNTRIES = [
    'united states', 'usa', 'us', 'united kingdom', 'uk', 'australia',
    'germany', 'france', 'canada', 'netherlands', 'italy', 'spain',
    'switzerland', 'uae', 'saudi arabia', 'japan', 'south korea',
  ];

  static PRICING_KEYWORDS = [
    'price', 'pricing', 'cost', 'rate', 'quote', 'quotation',
    'how much', 'charges', 'discount', 'bulk price', 'moq',
  ];

  static SHIPPING_KEYWORDS = [
    'shipping', 'delivery', 'ship', 'freight', 'courier', 'dhl',
    'fedex', 'air cargo', 'sea freight', 'logistics',
  ];

  static AVAILABILITY_KEYWORDS = [
    'available', 'in stock', 'stock', 'supply', 'ready',
  ];

  /**
   * Calculate the full score for a lead
   */
  async calculateScore(leadId) {
    const lead = await prisma.lead.findUnique({
      where: { id: leadId },
      include: { messages: { orderBy: { createdAt: 'asc' } } },
    });

    if (!lead) return 0;

    let score = 0;
    let replySpeed = 'none';
    let engagementLevel = 'none';

    // Load conversion weights (cached, non-blocking on error)
    let conversionWeights = null;
    try { conversionWeights = await this.getConversionWeights(); } catch {};

    const inboundMessages = lead.messages.filter(m => m.direction === 'inbound');
    const outboundSent = lead.messages.filter(m => m.direction === 'outbound' && m.status === 'sent');
    const outboundFailed = lead.messages.filter(m => m.direction === 'outbound' && m.status === 'permanently_failed');

    // ═══════════════════════════════════
    // POSITIVE SIGNALS
    // ═══════════════════════════════════

    if (inboundMessages.length > 0) {
      const outboundCountBeforeFirstReply = outboundSent.filter(
        m => m.sentAt && m.sentAt < inboundMessages[0].createdAt
      ).length;

      if (outboundCountBeforeFirstReply <= 1) {
        score += LeadScorer.SCORING.replyOnFirstOutreach;
      } else if (outboundCountBeforeFirstReply === 2) {
        score += LeadScorer.SCORING.replyOnSecondOutreach;
      } else if (outboundCountBeforeFirstReply === 3) {
        score += LeadScorer.SCORING.replyOnThirdOutreach;
      } else {
        score += LeadScorer.SCORING.replyOnFourthOrFifthOutreach;
      }

      if (inboundMessages.length > 1) {
        const extraReplies = Math.min(inboundMessages.length - 1, 4); // Capped at 4 replies (+20 pts max)
        score += extraReplies * LeadScorer.SCORING.multipleReplies;
      }
    }

    // Reply speed
    if (inboundMessages.length > 0 && outboundSent.length > 0) {
      const firstOutbound = outboundSent[0];
      const firstReply = inboundMessages[0];

      if (firstOutbound.sentAt && firstReply.createdAt) {
        const diffMs = firstReply.createdAt.getTime() - firstOutbound.sentAt.getTime();
        const diffHours = diffMs / (1000 * 60 * 60);

        if (diffHours < 1) {
          score += LeadScorer.SCORING.replySpeedFast;
          replySpeed = 'fast';
        } else if (diffHours < 4) {
          score += LeadScorer.SCORING.replySpeedMedium;
          replySpeed = 'medium';
        } else if (diffHours < 24) {
          score += LeadScorer.SCORING.replySpeedSlow;
          replySpeed = 'slow';
        }
      }
    }

    // Profile completeness
    if (lead.company) score += LeadScorer.SCORING.hasCompany;
    if (lead.email) score += LeadScorer.SCORING.hasEmail;
    if (lead.quantity) score += LeadScorer.SCORING.hasQuantity;

    // Engagement signals from reply content
    const allInboundText = inboundMessages.map(m => (m.content || '').toLowerCase()).join(' ');
    if (LeadScorer.PRICING_KEYWORDS.some(k => allInboundText.includes(k))) score += LeadScorer.SCORING.asksPricing;
    if (LeadScorer.SHIPPING_KEYWORDS.some(k => allInboundText.includes(k))) score += LeadScorer.SCORING.asksShipping;
    if (LeadScorer.AVAILABILITY_KEYWORDS.some(k => allInboundText.includes(k))) score += LeadScorer.SCORING.asksAvailability;

    // Email engagement bonus
    const emailInbound = inboundMessages.filter(m => m.channel === 'email');
    const waInbound = inboundMessages.filter(m => m.channel === 'whatsapp' || !m.channel);
    if (emailInbound.length > 0) score += LeadScorer.SCORING.emailReply;
    if (emailInbound.length > 0 && waInbound.length > 0) score += LeadScorer.SCORING.multiChannelEngagement;

    // Geographic scoring
    if (lead.country) {
      const countryLower = lead.country.toLowerCase();
      if (LeadScorer.HIGH_VALUE_COUNTRIES.some(c => countryLower === c)) {
        score += LeadScorer.SCORING.highValueCountry;
      }
    }

    // ═══════════════════════════════════
    // NEGATIVE SIGNALS
    // ═══════════════════════════════════

    // Unanswered follow-ups penalty
    if (inboundMessages.length === 0 && outboundSent.length > 0) {
      const unanswered = Math.min(outboundSent.length, 5);
      score += Math.max(unanswered * LeadScorer.SCORING.perUnansweredFollowup, LeadScorer.SCORING.maxUnansweredPenalty);
    }

    // Ghost lead: 5+ messages sent, 0 replies
    if (inboundMessages.length === 0 && outboundSent.length >= 5) {
      score += LeadScorer.SCORING.ghostLead;
    }

    // WA number invalid (halved penalty if being contacted via email)
    if (lead.isOnWhatsApp === false) {
      const hasEmailContact = lead.emailStatus && lead.emailStatus !== 'none';
      score += hasEmailContact ? Math.floor(LeadScorer.SCORING.waNumberInvalid / 2) : LeadScorer.SCORING.waNumberInvalid;
    }

    // Permanently failed messages
    if (outboundFailed.length > 0) {
      score += LeadScorer.SCORING.messagesPermanentlyFailed;
    }

    // ═══════════════════════════════════
    // TIME DECAY
    // ═══════════════════════════════════

    const lastActivity = lead.repliedAt || lead.lastMessageAt || lead.createdAt;
    if (lastActivity) {
      const weeksSinceActivity = Math.floor((Date.now() - new Date(lastActivity).getTime()) / (7 * 24 * 60 * 60 * 1000));
      if (weeksSinceActivity > 0) {
        score += Math.max(weeksSinceActivity * LeadScorer.SCORING.decayPerWeek, LeadScorer.SCORING.maxDecay);
      }
    }

    // ═══════════════════════════════════
    // PREDICTIVE CONVERSION BONUS
    // ═══════════════════════════════════
    try {
      const convBonus = await this.getConversionBonus(lead, conversionWeights);
      score += convBonus;
    } catch {}

    // Clamp 0-100
    score = Math.max(0, Math.min(score, 100));

    // Determine engagement level
    if (score >= 70) engagementLevel = 'high';
    else if (score >= 40) engagementLevel = 'medium';
    else if (score >= 10) engagementLevel = 'low';
    else engagementLevel = 'none';

    // Update the lead
    await prisma.lead.update({
      where: { id: leadId },
      data: { score, replySpeed, engagementLevel },
    });

    return score;
  }

  /**
   * Get the score tier label
   */
  static getTier(score) {
    if (score >= 70) return { label: 'Hot', emoji: '🔥', color: '#ff6b6b' };
    if (score >= 40) return { label: 'Warm', emoji: '🟡', color: '#ffd93d' };
    if (score >= 10) return { label: 'Cold', emoji: '🔵', color: '#4da6ff' };
    return { label: 'Dead', emoji: '⚪', color: '#8888a8' };
  }

  /**
   * Compute conversion affinity weights from won deals.
   * Analyzes all closed leads with convertedAt set and builds
   * frequency maps: country → conv rate, source → conv rate.
   * Results are cached in SystemConfig for 24h.
   * Returns { countryRates, sourceRates, avgDealValue, sampleSize }
   */
  async getConversionWeights() {
    const cached = await prisma.systemConfig.findUnique({ where: { key: 'scoring.conversionWeights' } });
    if (cached) {
      try {
        const parsed = JSON.parse(cached.value);
        const ageMs = Date.now() - (parsed.computedAt || 0);
        if (ageMs < 24 * 60 * 60 * 1000) return parsed; // < 24h old
      } catch {}
    }

    // Fetch all leads to compute conversion rates per segment
    const [allLeads, convertedLeads] = await Promise.all([
      prisma.lead.findMany({ select: { country: true, source: true, status: true, convertedAt: true, dealValue: true } }),
      prisma.lead.findMany({ where: { convertedAt: { not: null } }, select: { country: true, source: true, dealValue: true } }),
    ]);

    // Country conversion rates
    const countryTotal = {};
    const countryConverted = {};
    for (const l of allLeads) {
      const c = (l.country || '').toLowerCase().trim() || 'unknown';
      countryTotal[c] = (countryTotal[c] || 0) + 1;
    }
    for (const l of convertedLeads) {
      const c = (l.country || '').toLowerCase().trim() || 'unknown';
      countryConverted[c] = (countryConverted[c] || 0) + 1;
    }
    const countryRates = {};
    for (const [c, total] of Object.entries(countryTotal)) {
      if (total >= 3) { // minimum sample
        countryRates[c] = (countryConverted[c] || 0) / total;
      }
    }

    // Source conversion rates
    const sourceTotal = {};
    const sourceConverted = {};
    for (const l of allLeads) {
      const s = l.source || 'unknown';
      sourceTotal[s] = (sourceTotal[s] || 0) + 1;
    }
    for (const l of convertedLeads) {
      const s = l.source || 'unknown';
      sourceConverted[s] = (sourceConverted[s] || 0) + 1;
    }
    const sourceRates = {};
    for (const [s, total] of Object.entries(sourceTotal)) {
      if (total >= 3) {
        sourceRates[s] = (sourceConverted[s] || 0) / total;
      }
    }

    const dealValues = convertedLeads.map(l => l.dealValue).filter(v => v != null);
    const avgDealValue = dealValues.length ? dealValues.reduce((a, b) => a + b, 0) / dealValues.length : 0;

    const weights = { countryRates, sourceRates, avgDealValue, sampleSize: convertedLeads.length, computedAt: Date.now() };
    await prisma.systemConfig.upsert({
      where: { key: 'scoring.conversionWeights' },
      create: { key: 'scoring.conversionWeights', value: JSON.stringify(weights) },
      update: { value: JSON.stringify(weights) },
    });

    logger.info(`📊 Conversion weights computed: ${convertedLeads.length} deals, ${Object.keys(countryRates).length} countries`);
    return weights;
  }

  /**
   * Compute a predictive conversion affinity bonus (0-15 pts).
   * Uses conversion weight data to boost leads that match patterns
   * seen in historically successful deals.
   */
  async getConversionBonus(lead, weights) {
    if (!weights || weights.sampleSize < 5) return 0; // need at least 5 won deals for signal

    let bonus = 0;
    const globalConvRate = weights.sampleSize / Math.max(Object.values(weights.countryRates).reduce((a, b, i, arr) => {
      // proxy: rough total from countryRates * countryTotal estimate — just use simple check
      return a + 1;
    }, 0), 1);

    // Country affinity: bonus if this country converts 2x+ above the median
    if (lead.country) {
      const c = lead.country.toLowerCase().trim();
      const rate = weights.countryRates[c];
      if (rate !== undefined) {
        const median = Object.values(weights.countryRates).sort()[Math.floor(Object.values(weights.countryRates).length / 2)] || 0.05;
        if (rate >= median * 2) bonus += 8;
        else if (rate >= median * 1.3) bonus += 4;
      }
    }

    // Source affinity: bonus if this source converts above average
    if (lead.source) {
      const rate = weights.sourceRates[lead.source];
      if (rate !== undefined) {
        const rates = Object.values(weights.sourceRates);
        const avg = rates.reduce((a, b) => a + b, 0) / rates.length;
        if (rate >= avg * 1.5) bonus += 7;
        else if (rate >= avg) bonus += 3;
      }
    }

    return Math.min(bonus, 15); // cap predictive bonus at 15 pts
  }

  /**
   * Recompute leadTier (HOT/WARM/COLD) from consumedAt for one lead.
   * Tier is set once at ingestion in leadPoller — without this pass, a lead
   * imported HOT 6 months ago stays HOT forever and keeps stealing the high
   * priority slot in the send queue.
   */
  async recomputeTier(leadId) {
    const lead = await prisma.lead.findUnique({
      where: { id: leadId },
      select: { id: true, consumedAt: true, leadTier: true },
    });
    if (!lead || !lead.consumedAt) return null;

    const newTier = computeLeadTier(lead.consumedAt);
    if (newTier === lead.leadTier) {
      await prisma.lead.update({
        where: { id: leadId },
        data: { leadTierUpdatedAt: new Date() },
      });
      return null;
    }

    await prisma.lead.update({
      where: { id: leadId },
      data: { leadTier: newTier, leadTierUpdatedAt: new Date() },
    });
    return { from: lead.leadTier, to: newTier };
  }

  /**
   * Recalculate scores for ALL leads (not just replied ones).
   * Also re-evaluates leadTier from consumedAt so freshness decays over time.
   */
  async recalculateAll() {
    const leads = await prisma.lead.findMany({
      where: {
        status: { notIn: ['wa_unavailable'] },
      },
      select: { id: true },
    });

    let updated = 0;
    const tierChanges = { 'HOT→WARM': 0, 'HOT→COLD': 0, 'WARM→COLD': 0, other: 0 };
    for (const lead of leads) {
      try {
        await this.calculateScore(lead.id);
        const change = await this.recomputeTier(lead.id);
        if (change) {
          const key = `${change.from}→${change.to}`;
          if (key in tierChanges) tierChanges[key]++;
          else tierChanges.other++;
        }
        updated++;
      } catch (err) {
        logger.error(`Failed to score lead ${lead.id}: ${err.message}`);
      }
    }
    const decayed = Object.values(tierChanges).reduce((a, b) => a + b, 0);
    logger.info(`📊 Recalculated scores for ${updated} leads; ${decayed} tier transitions (${JSON.stringify(tierChanges)})`);
    return updated;
  }
}

const leadScorer = new LeadScorer();
export default leadScorer;
