import prisma from '../utils/prismaClient.js';
import logger from '../utils/logger.js';
import activityLog, { EVENT_TYPES } from '../utils/activityLog.js';

/**
 * Intervention Engine
 * Detects when a lead needs human attention and creates actionable alerts.
 *
 * Trigger Types:
 *  - SCORE_THRESHOLD:   Lead score crosses 70+ (hot lead)
 *  - BUYING_SIGNAL:     Reply mentions pricing, quantity, payment, order
 *  - NEGATIVE_SIGNAL:   Reply mentions competition, complaint, not interested
 *  - SLA_BREACH:        Engaged/replied lead not responded to within N hours
 *  - FIRST_REPLY:       Any first inbound reply (needs human review)
 *  - EMAIL_REPLY:       Email reply received (often higher intent)
 *  - MULTI_REPLY:       2+ replies — lead is engaged, close the deal
 *  - WA_FAILED:         Lead unreachable on WA, has email — try email outreach
 */

// ── Signal Detection Keywords ──

const BUYING_SIGNALS = [
  'price', 'pricing', 'cost', 'rate', 'quote', 'quotation', 'how much',
  'order', 'purchase', 'buy', 'payment', 'pay', 'invoice',
  'quantity', 'moq', 'minimum order', 'bulk',
  'ship', 'shipping', 'delivery', 'dispatch', 'freight',
  'coa', 'certificate', 'certification', 'gmp', 'fda',
  'sample', 'trial order',
];

const NEGATIVE_SIGNALS = [
  'not interested', 'no thanks', 'don\'t contact', 'stop messaging',
  'already bought', 'found another', 'other supplier', 'competitor',
  'too expensive', 'too costly', 'budget', 'overpriced',
  'complaint', 'unhappy', 'problem', 'issue',
  'spam', 'block', 'report',
];

const URGENCY_SIGNALS = [
  'urgent', 'asap', 'immediately', 'right now', 'today',
  'need it fast', 'rush order', 'expedite',
];

class InterventionEngine {
  constructor() {
    // In-memory alert buffer for SSE broadcasting
    this._alerts = [];
    this._maxAlerts = 200;
  }

  /**
   * Analyze an inbound message and create intervention alerts.
   * Called by replyDetector on every inbound message.
   *
   * @param {object} lead - Lead record
   * @param {string} messageContent - The inbound message text
   * @param {string} channel - 'whatsapp' | 'email'
   * @returns {object[]} Array of generated alerts
   */
  async analyzeReply(lead, messageContent, channel = 'whatsapp') {
    const alerts = [];
    const text = (messageContent || '').toLowerCase();

    // ── 1. First Reply Alert ──
    const inboundCount = await prisma.message.count({
      where: { leadId: lead.id, direction: 'inbound' },
    });

    if (inboundCount <= 1) {
      alerts.push(this._createAlert(lead, 'FIRST_REPLY', 'high',
        `${lead.name} replied for the first time${channel === 'email' ? ' via email' : ''}! Review and respond.`,
        { channel }
      ));
    }

    // ── 2. Multi-Reply (Engaged) Alert ──
    if (inboundCount >= 2) {
      alerts.push(this._createAlert(lead, 'MULTI_REPLY', 'critical',
        `${lead.name} has sent ${inboundCount} replies — they're engaged. Close this deal!`,
        { replyCount: inboundCount, channel }
      ));
    }

    // ── 3. Email Reply (often higher intent) ──
    if (channel === 'email') {
      alerts.push(this._createAlert(lead, 'EMAIL_REPLY', 'high',
        `${lead.name} replied via email about ${lead.product || 'their inquiry'}. Check inbox.`,
        { channel: 'email' }
      ));
    }

    // ── 4. Buying Signal Detection ──
    const detectedBuying = BUYING_SIGNALS.filter(kw => text.includes(kw));
    if (detectedBuying.length > 0) {
      const urgentBuying = URGENCY_SIGNALS.some(kw => text.includes(kw));
      alerts.push(this._createAlert(lead, 'BUYING_SIGNAL',
        urgentBuying ? 'critical' : 'high',
        `${lead.name} is showing buying intent: ${detectedBuying.slice(0, 3).join(', ')}${urgentBuying ? ' (URGENT)' : ''}`,
        { signals: detectedBuying, urgent: urgentBuying, channel }
      ));
    }

    // ── 5. Negative Signal Detection ──
    const detectedNegative = NEGATIVE_SIGNALS.filter(kw => text.includes(kw));
    if (detectedNegative.length > 0) {
      alerts.push(this._createAlert(lead, 'NEGATIVE_SIGNAL', 'medium',
        `${lead.name} may not be interested: ${detectedNegative.slice(0, 3).join(', ')}. Handle carefully.`,
        { signals: detectedNegative, channel }
      ));
    }

    // ── 6. Score Threshold Check ──
    if (lead.score >= 70) {
      alerts.push(this._createAlert(lead, 'SCORE_THRESHOLD', 'high',
        `${lead.name} score is ${lead.score} (HOT). Prioritize this lead!`,
        { score: lead.score }
      ));
    }

    // Save alerts to DB and broadcast
    for (const alert of alerts) {
      await this._persistAlert(alert);
    }

    return alerts;
  }

  /**
   * Check for SLA breaches — leads that replied/engaged but haven't been responded to.
   * Called on a cron schedule.
   */
  async checkSLABreaches() {
    const slaHours = 2; // Default: 2 hours for replied/engaged leads
    const cutoff = new Date(Date.now() - slaHours * 60 * 60 * 1000);

    // Find leads that replied/engaged but haven't received a response
    const breachedLeads = await prisma.lead.findMany({
      where: {
        status: { in: ['replied', 'engaged'] },
        repliedAt: { lte: cutoff },
      },
      include: {
        messages: {
          orderBy: { createdAt: 'desc' },
          take: 1,
        },
      },
    });

    let alertCount = 0;

    for (const lead of breachedLeads) {
      const lastMsg = lead.messages[0];
      // Only alert if last message was inbound (they're waiting for us)
      if (!lastMsg || lastMsg.direction !== 'inbound') continue;

      const hoursSinceReply = Math.floor((Date.now() - new Date(lastMsg.createdAt).getTime()) / (1000 * 60 * 60));

      // Check if we already alerted for this recently (dedup)
      const recentAlert = this._alerts.find(a =>
        a.leadId === lead.id && a.type === 'SLA_BREACH' &&
        Date.now() - new Date(a.createdAt).getTime() < 4 * 60 * 60 * 1000 // no duplicate within 4h
      );
      if (recentAlert) continue;

      const alert = this._createAlert(lead, 'SLA_BREACH', 'critical',
        `${lead.name} replied ${hoursSinceReply}h ago and is still waiting for a response!`,
        { hoursSinceReply, lastMessage: lastMsg.content?.substring(0, 100) }
      );
      await this._persistAlert(alert);
      alertCount++;
    }

    if (alertCount > 0) {
      logger.info(`🚨 SLA check: ${alertCount} lead(s) need immediate attention`);
    }
  }

  /**
   * Get the priority inbox — leads sorted by urgency for human action.
   */
  async getPriorityInbox(limit = 20) {
    // Fetch leads that need human attention (replied, engaged, or with recent alerts)
    const leads = await prisma.lead.findMany({
      where: {
        status: { in: ['replied', 'engaged'] },
      },
      include: {
        messages: {
          orderBy: { createdAt: 'desc' },
          take: 3,
          select: { direction: true, content: true, channel: true, createdAt: true },
        },
      },
      orderBy: [
        { score: 'desc' },
        { repliedAt: 'desc' },
      ],
      take: limit,
    });

    // Enrich with urgency scoring
    return leads.map(lead => {
      let urgency = 0;

      // Score-based urgency
      if (lead.score >= 70) urgency += 3;
      else if (lead.score >= 40) urgency += 1;

      // Recency of last message
      const lastMsg = lead.messages[0];
      if (lastMsg?.direction === 'inbound') {
        const hoursSince = (Date.now() - new Date(lastMsg.createdAt).getTime()) / (1000 * 60 * 60);
        if (hoursSince < 1) urgency += 3;
        else if (hoursSince < 4) urgency += 2;
        else if (hoursSince < 24) urgency += 1;
      }

      // Active alerts for this lead
      const leadAlerts = this._alerts.filter(a => a.leadId === lead.id);
      const hasCritical = leadAlerts.some(a => a.priority === 'critical');
      if (hasCritical) urgency += 4;

      return {
        ...lead,
        urgency,
        alerts: leadAlerts.slice(0, 5),
        lastMessagePreview: lastMsg?.content?.substring(0, 120),
        lastMessageChannel: lastMsg?.channel || 'whatsapp',
        waitingForResponse: lastMsg?.direction === 'inbound',
      };
    }).sort((a, b) => b.urgency - a.urgency);
  }

  /**
   * Get recent alerts, optionally filtered.
   */
  getAlerts({ limit = 50, priority, type, unreadOnly = false } = {}) {
    let filtered = [...this._alerts];
    if (priority) filtered = filtered.filter(a => a.priority === priority);
    if (type) filtered = filtered.filter(a => a.type === type);
    if (unreadOnly) filtered = filtered.filter(a => !a.readAt);
    return filtered.slice(0, limit);
  }

  /**
   * Mark an alert as read.
   */
  markAlertRead(alertId) {
    const alert = this._alerts.find(a => a.id === alertId);
    if (alert) {
      alert.readAt = new Date().toISOString();
    }
  }

  /**
   * Mark all alerts as read.
   */
  markAllRead() {
    const now = new Date().toISOString();
    this._alerts.forEach(a => { a.readAt = a.readAt || now; });
  }

  /**
   * Get unread alert count.
   */
  getUnreadCount() {
    return this._alerts.filter(a => !a.readAt).length;
  }

  // ── Internals ──

  _createAlert(lead, type, priority, message, meta = {}) {
    return {
      id: `alert_${Date.now()}_${Math.random().toString(36).slice(2, 6)}`,
      leadId: lead.id,
      leadName: lead.name,
      leadProduct: lead.product,
      leadScore: lead.score,
      type,
      priority, // critical | high | medium | low
      message,
      meta,
      createdAt: new Date().toISOString(),
      readAt: null,
    };
  }

  async _persistAlert(alert) {
    // Add to in-memory buffer
    this._alerts.unshift(alert);
    if (this._alerts.length > this._maxAlerts) {
      this._alerts = this._alerts.slice(0, this._maxAlerts);
    }

    // Broadcast via SSE
    try {
      const { broadcastEvent } = await import('../api.js');
      broadcastEvent('intervention', alert);
    } catch {}

    // Activity log
    activityLog.add('intervention', alert.message, {
      leadId: alert.leadId,
      type: alert.type,
      priority: alert.priority,
    });
  }
}

const interventionEngine = new InterventionEngine();
export default interventionEngine;
