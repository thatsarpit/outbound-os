import prisma from '../utils/prismaClient.js';
import logger from '../utils/logger.js';
import activityLog, { EVENT_TYPES } from '../utils/activityLog.js';
import emailService from './emailService.js';
import whatsappManager from './whatsapp.js';
import resourceMonitor from '../utils/resourceMonitor.js';
import { workspaceTimezone, zonedParts, zonedTimeToUtc } from '../utils/workspaceTime.js';
import businessProfile from '../businessProfile.js';

const REPORT_TYPES = new Set(['weekly', 'monthly']);
// Day-month-year reads the same way in most of the world; en-US would not.
const REPORT_LOCALE = 'en-GB';
const currencyFormatter = new Intl.NumberFormat(REPORT_LOCALE, {
  style: 'currency',
  currency: process.env.BUSINESS_CURRENCY || 'USD',
  maximumFractionDigits: 0,
});

function formatDate(date, options = {}) {
  return new Intl.DateTimeFormat(REPORT_LOCALE, {
    timeZone: workspaceTimezone(),
    day: '2-digit',
    month: 'short',
    year: 'numeric',
    ...options,
  }).format(date);
}

function formatDateTime(date) {
  return new Intl.DateTimeFormat(REPORT_LOCALE, {
    timeZone: workspaceTimezone(),
    day: '2-digit',
    month: 'short',
    year: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
    hour12: true,
  }).format(date);
}

function formatCompactDate(date) {
  return new Intl.DateTimeFormat(REPORT_LOCALE, {
    timeZone: workspaceTimezone(),
    day: '2-digit',
    month: 'short',
  }).format(date);
}

function formatPercent(value) {
  if (!Number.isFinite(value)) return '0.0%';
  return `${value.toFixed(1)}%`;
}

function escapeHtml(value) {
  return String(value ?? '')
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');
}

function formatDelta(current, previous, suffix = '') {
  if (!Number.isFinite(current) || !Number.isFinite(previous)) return 'n/a';
  if (previous === 0) {
    if (current === 0) return `0${suffix}`;
    return `+${current}${suffix} from 0`;
  }
  const delta = ((current - previous) / previous) * 100;
  const sign = delta > 0 ? '+' : '';
  return `${sign}${delta.toFixed(1)}%`;
}

function summarizeMix(rows, total, limit = rows.length) {
  return rows.slice(0, limit).map((row) => ({
    label: row.label,
    count: row.count,
    share: total > 0 ? (row.count / total) * 100 : 0,
  }));
}

function groupRows(rows, key, fallback = 'Unknown') {
  const groups = new Map();
  for (const row of rows) {
    const raw = row[key];
    const label = raw && String(raw).trim() ? String(raw).trim() : fallback;
    groups.set(label, (groups.get(label) || 0) + 1);
  }
  return [...groups.entries()]
    .map(([label, count]) => ({ label, count }))
    .sort((a, b) => b.count - a.count);
}

function getPeriodWindow(type, now = new Date(), timeZone = workspaceTimezone()) {
  const { year, month, day, weekday } = zonedParts(now, timeZone);

  if (type === 'weekly') {
    // Weeks start on Monday. Each boundary is midnight in the workspace zone,
    // resolved separately so a daylight-saving change mid-period stays exact.
    const daysSinceMonday = (weekday + 6) % 7;
    const thisMonday = day - daysSinceMonday;
    const start = zonedTimeToUtc(year, month, thisMonday - 7, 0, 0, timeZone);
    const end = zonedTimeToUtc(year, month, thisMonday, 0, 0, timeZone);
    const previousStart = zonedTimeToUtc(year, month, thisMonday - 14, 0, 0, timeZone);
    const previousEnd = start;
    return {
      type,
      start,
      end,
      previousStart,
      previousEnd,
      periodKey: `${formatDate(start, { day: '2-digit', month: '2-digit', year: 'numeric' })}:${formatDate(new Date(end.getTime() - 1), { day: '2-digit', month: '2-digit', year: 'numeric' })}`,
      label: `${formatCompactDate(start)} - ${formatDate(new Date(end.getTime() - 1))}`,
    };
  }

  const currentMonthStart = zonedTimeToUtc(year, month, 1, 0, 0, timeZone);
  const start = zonedTimeToUtc(year, month - 1, 1, 0, 0, timeZone);
  const end = currentMonthStart;
  const previousStart = zonedTimeToUtc(year, month - 2, 1, 0, 0, timeZone);
  const previousEnd = start;
  return {
    type,
    start,
    end,
    previousStart,
    previousEnd,
    periodKey: formatDate(start, { month: '2-digit', year: 'numeric' }),
    label: new Intl.DateTimeFormat(REPORT_LOCALE, {
      timeZone,
      month: 'long',
      year: 'numeric',
    }).format(start),
  };
}

function trendPill(current, previous, suffix = '') {
  const delta = formatDelta(current, previous, suffix);
  const positive = current >= previous;
  return {
    text: delta,
    tone: positive ? '#0f9d58' : '#d93025',
    bg: positive ? '#eaf7ef' : '#fdecea',
  };
}

class ReportingService {
  getSchedules() {
    return {
      weekly: {
        cron: '0 8 * * 1',
        timezone: workspaceTimezone(),
        description: `Every Monday at 08:00 (${workspaceTimezone()})`,
      },
      monthly: {
        cron: '15 8 1 * *',
        timezone: workspaceTimezone(),
        description: `1st of every month at 08:15 (${workspaceTimezone()})`,
      },
    };
  }

  async getStatus() {
    const recipient = await this.resolveRecipient().catch(() => null);
    const senderAccount = await this._resolveSenderAccount().catch(() => null);
    const rows = await prisma.systemConfig.findMany({
      where: {
        key: {
          in: [
            'reports.admin_email',
            'reports.weekly.last_period_key',
            'reports.weekly.last_sent_at',
            'reports.monthly.last_period_key',
            'reports.monthly.last_sent_at',
          ],
        },
      },
    });
    const configMap = Object.fromEntries(rows.map((row) => [row.key, row.value]));

    return {
      schedules: this.getSchedules(),
      recipient,
      senderAccount: senderAccount ? {
        id: senderAccount.id,
        email: senderAccount.email,
        name: senderAccount.name,
        status: senderAccount.status,
      } : null,
      lastSent: {
        weekly: {
          periodKey: configMap['reports.weekly.last_period_key'] || null,
          sentAt: configMap['reports.weekly.last_sent_at'] || null,
        },
        monthly: {
          periodKey: configMap['reports.monthly.last_period_key'] || null,
          sentAt: configMap['reports.monthly.last_sent_at'] || null,
        },
      },
      configuredRecipient: configMap['reports.admin_email']
        || process.env.REPORTS_ADMIN_EMAIL
        || process.env.ADMIN_EMAIL
        || null,
    };
  }

  async resolveRecipient() {
    const configured = await prisma.systemConfig.findUnique({ where: { key: 'reports.admin_email' } });
    const configEmail = configured?.value?.trim();
    if (configEmail) return configEmail;

    const admin = await prisma.user.findFirst({
      where: { role: 'admin', enabled: true },
      orderBy: { createdAt: 'asc' },
      select: { email: true },
    });
    if (admin?.email) return admin.email;

    const envEmail = (process.env.REPORTS_ADMIN_EMAIL || process.env.ADMIN_EMAIL)?.trim();
    if (envEmail) return envEmail;

    throw new Error('No admin recipient email found. Set reports.admin_email or REPORTS_ADMIN_EMAIL.');
  }

  async sendReport({ type, force = false, recipientOverride = null } = {}) {
    if (!REPORT_TYPES.has(type)) throw new Error('Report type must be weekly or monthly');

    const window = getPeriodWindow(type);
    const recipient = recipientOverride || await this.resolveRecipient();
    const alreadySent = await prisma.systemConfig.findUnique({
      where: { key: `reports.${type}.last_period_key` },
    });

    if (!force && alreadySent?.value === window.periodKey) {
      return {
        ok: true,
        skipped: true,
        reason: `Report for ${window.periodKey} already sent`,
        type,
        periodKey: window.periodKey,
        recipient,
      };
    }

    const payload = await this._buildPayload(window);
    const subject = this._buildSubject(payload);
    const htmlBody = this._renderHtml(payload);
    const textBody = this._renderText(payload);
    const sendResult = await emailService.sendSystemEmail({
      to: recipient,
      subject,
      htmlBody,
      textBody,
      tag: `ops_report_${type}`,
    });

    await prisma.$transaction([
      prisma.systemConfig.upsert({
        where: { key: `reports.${type}.last_period_key` },
        update: { value: window.periodKey },
        create: { key: `reports.${type}.last_period_key`, value: window.periodKey },
      }),
      prisma.systemConfig.upsert({
        where: { key: `reports.${type}.last_sent_at` },
        update: { value: new Date().toISOString() },
        create: { key: `reports.${type}.last_sent_at`, value: new Date().toISOString() },
      }),
      prisma.systemConfig.upsert({
        where: { key: 'reports.admin_email' },
        update: { value: recipient },
        create: { key: 'reports.admin_email', value: recipient },
      }),
    ]);

    activityLog.add(
      EVENT_TYPES.EMAIL_SENT,
      `${type[0].toUpperCase() + type.slice(1)} report sent to ${recipient}`,
      { type, periodKey: window.periodKey, recipient }
    );

    logger.info(`📨 ${type} report sent to ${recipient} for ${window.periodKey}`);

    return {
      ok: true,
      skipped: false,
      type,
      periodKey: window.periodKey,
      recipient,
      subject,
      messageId: sendResult.messageId,
    };
  }

  async _resolveSenderAccount() {
    return emailService.getSystemSenderAccount();
  }

  async _buildPayload(window) {
    const [current, previous, snapshot, operations] = await Promise.all([
      this._getPeriodMetrics(window.start, window.end),
      this._getPeriodMetrics(window.previousStart, window.previousEnd),
      this._getCurrentSnapshot(),
      this._getOperationalHealth(),
    ]);

    return {
      window,
      generatedAt: new Date(),
      current,
      previous,
      snapshot,
      operations,
      highlights: this._buildHighlights(current, previous, snapshot, operations),
    };
  }

  async _getPeriodMetrics(start, end) {
    const rangeLead = { gte: start, lt: end };
    const rangeMessage = { gte: start, lt: end };

    const [
      leadsCreated,
      outboundSent,
      outboundWhatsApp,
      outboundEmail,
      repliesReceived,
      contactedRows,
      replyingRows,
      closedAgg,
      createdLeads,
      campaignLeadRows,
      recentClosed,
      recentReplies,
    ] = await Promise.all([
      prisma.lead.count({ where: { createdAt: rangeLead } }),
      prisma.message.count({
        where: {
          direction: 'outbound',
          sentAt: rangeMessage,
          status: { in: ['sent', 'delivered', 'read'] },
        },
      }),
      prisma.message.count({
        where: {
          direction: 'outbound',
          channel: 'whatsapp',
          sentAt: rangeMessage,
          status: { in: ['sent', 'delivered', 'read'] },
        },
      }),
      prisma.message.count({
        where: {
          direction: 'outbound',
          channel: 'email',
          sentAt: rangeMessage,
          status: { in: ['sent', 'delivered', 'read'] },
        },
      }),
      prisma.message.count({
        where: {
          direction: 'inbound',
          createdAt: rangeMessage,
        },
      }),
      prisma.message.findMany({
        where: {
          direction: 'outbound',
          sentAt: rangeMessage,
          status: { in: ['sent', 'delivered', 'read'] },
        },
        distinct: ['leadId'],
        select: { leadId: true },
      }),
      prisma.message.findMany({
        where: {
          direction: 'inbound',
          createdAt: rangeMessage,
        },
        distinct: ['leadId'],
        select: { leadId: true },
      }),
      prisma.lead.aggregate({
        where: { convertedAt: rangeLead, status: 'closed', dealValue: { not: null } },
        _count: { id: true },
        _sum: { dealValue: true },
        _avg: { dealValue: true },
      }),
      prisma.lead.findMany({
        where: { createdAt: rangeLead },
        select: {
          id: true,
          source: true,
          country: true,
          leadTier: true,
          status: true,
          lastReplyIntent: true,
        },
      }),
      prisma.campaignLead.findMany({
        where: {
          sentAt: rangeLead,
        },
        include: {
          campaign: {
            select: { id: true, name: true, channel: true, status: true },
          },
          lead: {
            select: { status: true, dealValue: true },
          },
        },
      }),
      prisma.lead.findMany({
        where: { convertedAt: rangeLead, status: 'closed' },
        orderBy: { convertedAt: 'desc' },
        take: 5,
        select: {
          id: true,
          name: true,
          company: true,
          dealValue: true,
          convertedAt: true,
          country: true,
        },
      }),
      prisma.message.findMany({
        where: { direction: 'inbound', createdAt: rangeMessage },
        orderBy: { createdAt: 'desc' },
        take: 5,
        include: {
          lead: { select: { id: true, name: true, company: true } },
        },
      }),
    ]);

    const createdLeadTotal = createdLeads.length;
    const bySource = summarizeMix(groupRows(createdLeads, 'source', 'Unknown'), createdLeadTotal, 5);
    const byCountry = summarizeMix(groupRows(createdLeads, 'country', 'Unknown'), createdLeadTotal, 5);
    const byTier = summarizeMix(groupRows(createdLeads, 'leadTier', 'Unscored'), createdLeadTotal, 5);
    const byStatus = summarizeMix(groupRows(createdLeads, 'status', 'Unknown'), createdLeadTotal, 7);
    const byIntent = summarizeMix(groupRows(createdLeads.filter((lead) => lead.lastReplyIntent), 'lastReplyIntent', 'Unknown'), createdLeadTotal, 5);

    const campaignMap = new Map();
    for (const row of campaignLeadRows) {
      const key = row.campaignId;
      if (!campaignMap.has(key)) {
        campaignMap.set(key, {
          id: row.campaign.id,
          name: row.campaign.name,
          channel: row.campaign.channel,
          sent: 0,
          replied: 0,
          converted: 0,
          revenue: 0,
        });
      }
      const item = campaignMap.get(key);
      item.sent += 1;
      if (['replied', 'engaged', 'closed'].includes(row.lead.status)) item.replied += 1;
      if (row.lead.status === 'closed' && row.lead.dealValue) {
        item.converted += 1;
        item.revenue += row.lead.dealValue;
      }
    }

    const campaigns = [...campaignMap.values()]
      .map((campaign) => ({
        ...campaign,
        replyRate: campaign.sent > 0 ? (campaign.replied / campaign.sent) * 100 : 0,
        conversionRate: campaign.sent > 0 ? (campaign.converted / campaign.sent) * 100 : 0,
      }))
      .sort((a, b) => (b.revenue - a.revenue) || (b.replyRate - a.replyRate))
      .slice(0, 5);

    const closedDeals = closedAgg._count.id || 0;
    const revenue = closedAgg._sum.dealValue || 0;
    const avgDeal = closedAgg._avg.dealValue || 0;
    const contactedLeads = contactedRows.length;
    const repliedLeads = replyingRows.length;

    return {
      range: { start, end },
      leadsCreated,
      outboundSent,
      outboundWhatsApp,
      outboundEmail,
      repliesReceived,
      contactedLeads,
      repliedLeads,
      replyRate: outboundSent > 0 ? (repliedLeads / outboundSent) * 100 : 0,
      closeRate: contactedLeads > 0 ? (closedDeals / contactedLeads) * 100 : 0,
      closedDeals,
      revenue,
      avgDeal,
      bySource,
      byCountry,
      byTier,
      byStatus,
      byIntent,
      campaigns,
      recentClosed,
      recentReplies: recentReplies.map((message) => ({
        id: message.id,
        leadId: message.leadId,
        leadName: message.lead?.name || 'Unknown',
        company: message.lead?.company || '',
        content: (message.content || '').replace(/\s+/g, ' ').trim().slice(0, 140),
        createdAt: message.createdAt,
      })),
    };
  }

  async _getCurrentSnapshot() {
    const [statusRows, tierRows, totalLeads, queuedMessages, failedMessages, overdueTasks, campaignCounts] = await Promise.all([
      prisma.lead.groupBy({ by: ['status'], _count: { _all: true } }),
      prisma.lead.groupBy({ by: ['leadTier'], _count: { _all: true } }),
      prisma.lead.count(),
      prisma.message.count({ where: { status: 'queued', direction: 'outbound' } }),
      prisma.message.count({ where: { status: { in: ['failed', 'permanently_failed'] }, direction: 'outbound' } }),
      prisma.leadTask.count({ where: { done: false, dueAt: { lt: new Date() } } }),
      prisma.campaign.groupBy({ by: ['status'], _count: { _all: true } }),
    ]);

    return {
      totalLeads,
      queuedMessages,
      failedMessages,
      overdueTasks,
      statusMix: statusRows.map((row) => ({ label: row.status, count: row._count._all })),
      tierMix: tierRows.map((row) => ({ label: row.leadTier || 'Unscored', count: row._count._all })),
      campaignMix: campaignCounts.map((row) => ({ label: row.status, count: row._count._all })),
    };
  }

  async _getOperationalHealth() {
    const [waAccounts, emailAccounts] = await Promise.all([
      whatsappManager.getStatus().catch(() => []),
      emailService.listAccounts().catch(() => []),
    ]);
    const resources = resourceMonitor.getHealth();

    const waEnabled = waAccounts.filter((account) => account.enabled).length;
    const waReady = waAccounts.filter((account) => account.enabled && account.isReady).length;
    const waPaused = waAccounts.filter((account) => account.isPaused).length;
    const emailReady = emailAccounts.filter((account) => account.enabled && account.status === 'verified').length;

    return {
      waEnabled,
      waReady,
      waPaused,
      emailReady,
      emailEnabled: emailAccounts.filter((account) => account.enabled).length,
      cpuUsage: resources.cpu?.usage || 0,
      memoryPercent: resources.memory?.systemPercent || 0,
      queuePending: resources.queue?.pending || 0,
      llmCalls: resources.llm?.callCount || 0,
    };
  }

  _buildHighlights(current, previous, snapshot, operations) {
    const highlights = [];

    if (current.leadsCreated > previous.leadsCreated) {
      highlights.push(`Lead intake improved to ${current.leadsCreated}, ${formatDelta(current.leadsCreated, previous.leadsCreated)} vs the previous period.`);
    } else {
      highlights.push(`Lead intake landed at ${current.leadsCreated}, ${formatDelta(current.leadsCreated, previous.leadsCreated)} vs the previous period.`);
    }

    highlights.push(`Reply rate closed at ${formatPercent(current.replyRate)} (${current.repliedLeads} distinct replying leads from ${current.outboundSent} outbound messages).`);

    if (current.closedDeals > 0) {
      highlights.push(`Closed revenue for the period was ${currencyFormatter.format(current.revenue)} across ${current.closedDeals} deal${current.closedDeals === 1 ? '' : 's'}.`);
    } else {
      highlights.push('No closed revenue was recorded in this period, so follow-up quality and closer responsiveness need review.');
    }

    const topCountry = current.byCountry[0];
    if (topCountry) {
      highlights.push(`Top geography in this cohort was ${topCountry.label} at ${formatPercent(topCountry.share)} of new leads.`);
    }

    if (snapshot.queuedMessages > 0 || snapshot.failedMessages > 0) {
      highlights.push(`Operational watch: ${snapshot.queuedMessages} queued outbound message(s) and ${snapshot.failedMessages} failed message(s) remain in the system.`);
    }

    if (operations.waEnabled > 0) {
      highlights.push(`WhatsApp fleet health is ${operations.waReady}/${operations.waEnabled} ready with ${operations.waPaused} paused account(s).`);
    }

    if (!operations.emailReady) {
      highlights.push('No verified email account is currently available for system or campaign delivery. Email resilience needs attention.');
    }

    return highlights.slice(0, 7);
  }

  _buildSubject(payload) {
    const title = payload.window.type === 'weekly' ? 'Weekly' : 'Monthly';
    return `${title} ${businessProfile.dashboardBrand} Executive Report | ${payload.window.label}`;
  }

  _renderHtml(payload) {
    const { window, current, previous, snapshot, operations, generatedAt, highlights } = payload;
    const subject = this._buildSubject(payload);
    const replyTrend = trendPill(current.replyRate, previous.replyRate);
    const leadTrend = trendPill(current.leadsCreated, previous.leadsCreated);
    const revenueTrend = trendPill(current.revenue, previous.revenue);
    const closeTrend = trendPill(current.closedDeals, previous.closedDeals);
    const sourceRows = this._renderMiniTable(current.bySource, 'Source');
    const geoRows = this._renderMiniTable(current.byCountry, 'Country');
    const tierRows = this._renderMiniTable(current.byTier, 'Tier');
    const campaignRows = current.campaigns.length
      ? current.campaigns.map((campaign) => `
        <tr>
          <td>${escapeHtml(campaign.name)}</td>
          <td>${escapeHtml(campaign.channel)}</td>
          <td>${campaign.sent}</td>
          <td>${formatPercent(campaign.replyRate)}</td>
          <td>${campaign.converted}</td>
          <td>${currencyFormatter.format(campaign.revenue)}</td>
        </tr>
      `).join('')
      : `<tr><td colspan="6">No campaign sends recorded in this period.</td></tr>`;

    const wins = current.recentClosed.length
      ? current.recentClosed.map((lead) => `
        <li>
          <strong>${escapeHtml(lead.name)}</strong>${lead.company ? `, ${escapeHtml(lead.company)}` : ''} closed at
          ${currencyFormatter.format(lead.dealValue || 0)} on ${formatDateTime(lead.convertedAt)}.
        </li>
      `).join('')
      : '<li>No closed deals recorded in this period.</li>';

    const replies = current.recentReplies.length
      ? current.recentReplies.map((reply) => `
        <li>
          <strong>${escapeHtml(reply.leadName)}</strong>${reply.company ? `, ${escapeHtml(reply.company)}` : ''}:
          “${escapeHtml(reply.content || 'Reply received')}” on ${formatDateTime(reply.createdAt)}.
        </li>
      `).join('')
      : '<li>No recent inbound replies captured in this period.</li>';

    return `<!doctype html>
<html>
  <head>
    <meta charset="utf-8" />
    <meta name="viewport" content="width=device-width, initial-scale=1.0" />
    <title>${escapeHtml(subject)}</title>
  </head>
  <body style="margin:0;padding:0;background:#f4f7fb;font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',sans-serif;color:#122033;">
    <div style="max-width:980px;margin:0 auto;padding:32px 20px 48px;">
      <div style="background:linear-gradient(135deg,#0b3b66 0%,#114f91 45%,#1d7bd7 100%);border-radius:28px;padding:32px;color:#ffffff;box-shadow:0 20px 60px rgba(17,79,145,0.22);">
        <div style="display:inline-block;background:rgba(255,255,255,0.14);padding:8px 14px;border-radius:999px;font-size:12px;letter-spacing:0.08em;text-transform:uppercase;">${escapeHtml(window.type)} executive report</div>
        <h1 style="margin:18px 0 8px;font-size:34px;line-height:1.1;">${escapeHtml(businessProfile.dashboardBrand)} Operating Report</h1>
        <p style="margin:0 0 18px;font-size:17px;line-height:1.6;max-width:720px;color:rgba(255,255,255,0.9);">
          Period: <strong>${escapeHtml(window.label)}</strong><br />
          Generated: ${escapeHtml(formatDateTime(generatedAt))} (${escapeHtml(workspaceTimezone())})
        </p>
        <div style="display:flex;flex-wrap:wrap;gap:12px;margin-top:22px;">
          ${this._heroStat('Leads Captured', current.leadsCreated, leadTrend)}
          ${this._heroStat('Reply Rate', formatPercent(current.replyRate), replyTrend)}
          ${this._heroStat('Closed Deals', current.closedDeals, closeTrend)}
          ${this._heroStat('Revenue', currencyFormatter.format(current.revenue), revenueTrend)}
        </div>
      </div>

      <div style="display:grid;grid-template-columns:1.3fr 0.9fr;gap:18px;margin-top:20px;">
        <div style="background:#ffffff;border-radius:24px;padding:24px;box-shadow:0 12px 32px rgba(16,24,40,0.08);">
          <h2 style="margin:0 0 12px;font-size:20px;">Executive summary</h2>
          <ul style="margin:0;padding-left:18px;line-height:1.7;color:#334155;">
            ${highlights.map((item) => `<li>${escapeHtml(item)}</li>`).join('')}
          </ul>
        </div>
        <div style="background:#ffffff;border-radius:24px;padding:24px;box-shadow:0 12px 32px rgba(16,24,40,0.08);">
          <h2 style="margin:0 0 14px;font-size:20px;">Operational health</h2>
          ${this._metricRow('WhatsApp readiness', `${operations.waReady}/${operations.waEnabled || 0} ready`)}
          ${this._metricRow('WhatsApp paused', `${operations.waPaused}`)}
          ${this._metricRow('Email senders', `${operations.emailReady}/${operations.emailEnabled || 0} verified`)}
          ${this._metricRow('CPU', `${operations.cpuUsage.toFixed(1)}%`)}
          ${this._metricRow('Memory', `${operations.memoryPercent}%`)}
        </div>
      </div>

      <div style="display:grid;grid-template-columns:repeat(4,1fr);gap:14px;margin-top:20px;">
        ${this._kpiCard('Outbound sent', current.outboundSent, `${current.outboundWhatsApp} WA / ${current.outboundEmail} Email`)}
        ${this._kpiCard('Distinct contacts reached', current.contactedLeads, formatDelta(current.contactedLeads, previous.contactedLeads))}
        ${this._kpiCard('Replies received', current.repliesReceived, `${current.repliedLeads} leads replied`)}
        ${this._kpiCard('Average deal size', currencyFormatter.format(current.avgDeal || 0), formatDelta(current.avgDeal || 0, previous.avgDeal || 0))}
      </div>

      <div style="display:grid;grid-template-columns:repeat(3,1fr);gap:18px;margin-top:20px;">
        ${sourceRows}
        ${geoRows}
        ${tierRows}
      </div>

      <div style="background:#ffffff;border-radius:24px;padding:24px;box-shadow:0 12px 32px rgba(16,24,40,0.08);margin-top:20px;">
        <h2 style="margin:0 0 14px;font-size:20px;">Campaign performance</h2>
        <table style="width:100%;border-collapse:collapse;font-size:14px;">
          <thead>
            <tr style="text-align:left;background:#f8fafc;color:#475467;">
              <th style="padding:12px;">Campaign</th>
              <th style="padding:12px;">Channel</th>
              <th style="padding:12px;">Sent</th>
              <th style="padding:12px;">Reply rate</th>
              <th style="padding:12px;">Closed</th>
              <th style="padding:12px;">Revenue</th>
            </tr>
          </thead>
          <tbody style="color:#122033;">
            ${campaignRows}
          </tbody>
        </table>
      </div>

      <div style="display:grid;grid-template-columns:1fr 1fr;gap:18px;margin-top:20px;">
        <div style="background:#ffffff;border-radius:24px;padding:24px;box-shadow:0 12px 32px rgba(16,24,40,0.08);">
          <h2 style="margin:0 0 14px;font-size:20px;">Recent wins</h2>
          <ul style="margin:0;padding-left:18px;line-height:1.7;color:#334155;">${wins}</ul>
        </div>
        <div style="background:#ffffff;border-radius:24px;padding:24px;box-shadow:0 12px 32px rgba(16,24,40,0.08);">
          <h2 style="margin:0 0 14px;font-size:20px;">Recent replies</h2>
          <ul style="margin:0;padding-left:18px;line-height:1.7;color:#334155;">${replies}</ul>
        </div>
      </div>

      <div style="background:#ffffff;border-radius:24px;padding:24px;box-shadow:0 12px 32px rgba(16,24,40,0.08);margin-top:20px;">
        <h2 style="margin:0 0 14px;font-size:20px;">Current system snapshot</h2>
        <div style="display:grid;grid-template-columns:repeat(4,1fr);gap:14px;">
          ${this._kpiCard('Total leads', snapshot.totalLeads)}
          ${this._kpiCard('Queued outbound', snapshot.queuedMessages)}
          ${this._kpiCard('Failed outbound', snapshot.failedMessages)}
          ${this._kpiCard('Overdue tasks', snapshot.overdueTasks)}
        </div>
      </div>
    </div>
  </body>
</html>`;
  }

  _renderMiniTable(rows, title) {
    const body = rows.length
      ? rows.map((row) => `
          <tr>
            <td style="padding:10px 0;border-bottom:1px solid #eef2f6;">${escapeHtml(row.label)}</td>
            <td style="padding:10px 0;border-bottom:1px solid #eef2f6;text-align:right;">${row.count}</td>
            <td style="padding:10px 0;border-bottom:1px solid #eef2f6;text-align:right;">${formatPercent(row.share)}</td>
          </tr>
        `).join('')
      : '<tr><td colspan="3" style="padding:10px 0;">No data</td></tr>';

    return `
      <div style="background:#ffffff;border-radius:24px;padding:24px;box-shadow:0 12px 32px rgba(16,24,40,0.08);">
        <h2 style="margin:0 0 14px;font-size:20px;">${escapeHtml(title)} mix</h2>
        <table style="width:100%;border-collapse:collapse;font-size:14px;">
          <thead>
            <tr style="text-align:left;color:#667085;">
              <th style="padding-bottom:10px;">${escapeHtml(title)}</th>
              <th style="padding-bottom:10px;text-align:right;">Count</th>
              <th style="padding-bottom:10px;text-align:right;">Share</th>
            </tr>
          </thead>
          <tbody>${body}</tbody>
        </table>
      </div>
    `;
  }

  _heroStat(label, value, trend) {
    return `
      <div style="flex:1 1 190px;background:rgba(255,255,255,0.12);backdrop-filter:blur(8px);border:1px solid rgba(255,255,255,0.12);border-radius:20px;padding:18px 20px;">
        <div style="font-size:12px;text-transform:uppercase;letter-spacing:0.08em;color:rgba(255,255,255,0.72);">${escapeHtml(label)}</div>
        <div style="font-size:28px;font-weight:700;margin:8px 0 12px;">${escapeHtml(value)}</div>
        <span style="display:inline-block;padding:6px 10px;border-radius:999px;background:${trend.bg};color:${trend.tone};font-size:12px;font-weight:600;">${trend.text}</span>
      </div>
    `;
  }

  _kpiCard(label, value, subtext = '') {
    return `
      <div style="background:#ffffff;border-radius:20px;padding:20px;box-shadow:0 10px 28px rgba(16,24,40,0.07);">
        <div style="font-size:13px;color:#667085;text-transform:uppercase;letter-spacing:0.04em;">${escapeHtml(label)}</div>
        <div style="margin-top:10px;font-size:28px;font-weight:700;color:#101828;">${escapeHtml(value)}</div>
        ${subtext ? `<div style="margin-top:8px;font-size:13px;color:#475467;">${escapeHtml(subtext)}</div>` : ''}
      </div>
    `;
  }

  _metricRow(label, value) {
    return `
      <div style="display:flex;justify-content:space-between;gap:16px;padding:10px 0;border-bottom:1px solid #eef2f6;font-size:14px;">
        <span style="color:#475467;">${escapeHtml(label)}</span>
        <strong style="color:#101828;">${escapeHtml(value)}</strong>
      </div>
    `;
  }

  _renderText(payload) {
    const { window, current, previous, snapshot, operations, highlights } = payload;
    return [
      `${businessProfile.dashboardBrand} ${window.type === 'weekly' ? 'Weekly' : 'Monthly'} Executive Report`,
      `Period: ${window.label}`,
      '',
      'Executive summary',
      ...highlights.map((item) => `- ${item}`),
      '',
      'Core metrics',
      `- Leads captured: ${current.leadsCreated} (${formatDelta(current.leadsCreated, previous.leadsCreated)})`,
      `- Outbound sent: ${current.outboundSent} (${current.outboundWhatsApp} WA / ${current.outboundEmail} Email)`,
      `- Replies received: ${current.repliesReceived} across ${current.repliedLeads} leads`,
      `- Reply rate: ${formatPercent(current.replyRate)}`,
      `- Closed deals: ${current.closedDeals} (${formatDelta(current.closedDeals, previous.closedDeals)})`,
      `- Revenue closed: ${currencyFormatter.format(current.revenue)}`,
      `- Avg deal size: ${currencyFormatter.format(current.avgDeal || 0)}`,
      '',
      'Operational health',
      `- WhatsApp readiness: ${operations.waReady}/${operations.waEnabled || 0}`,
      `- Email senders verified: ${operations.emailReady}/${operations.emailEnabled || 0}`,
      `- CPU: ${operations.cpuUsage.toFixed(1)}% | Memory: ${operations.memoryPercent}%`,
      '',
      'Current snapshot',
      `- Total leads: ${snapshot.totalLeads}`,
      `- Queued outbound: ${snapshot.queuedMessages}`,
      `- Failed outbound: ${snapshot.failedMessages}`,
      `- Overdue tasks: ${snapshot.overdueTasks}`,
      '',
      'Top source mix',
      ...current.bySource.map((row) => `- ${row.label}: ${row.count} (${formatPercent(row.share)})`),
      '',
      'Top country mix',
      ...current.byCountry.map((row) => `- ${row.label}: ${row.count} (${formatPercent(row.share)})`),
    ].join('\n');
  }
}

const reportingService = new ReportingService();
export default reportingService;
