import { createHash } from 'crypto';

import prisma from '../utils/prismaClient.js';
import logger from '../utils/logger.js';
import brevoMarketingCampaigns from './brevoMarketingCampaigns.js';

function normalizeEmail(value) {
  const email = String(value || '').trim().toLowerCase();
  return /^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/.test(email) ? email : '';
}

function normalizePhone(value) {
  const phone = String(value || '').replace(/\D/g, '');
  return phone.length >= 8 && phone.length <= 16 ? phone : '';
}

function syntheticMobile(email) {
  return `email-${createHash('sha256').update(email).digest('hex').slice(0, 24)}`;
}

function combineTags(existing, additions) {
  const tags = new Set(String(existing || '').split(',').map((tag) => tag.trim()).filter(Boolean));
  for (const addition of additions) tags.add(addition);
  return [...tags].join(',');
}

function productSummary(payload) {
  const items = Array.isArray(payload?.items) ? payload.items : [];
  const labels = items.map((item) => String(item?.label || '').trim()).filter(Boolean);
  if (labels.length) return labels.slice(0, 5).join('; ').slice(0, 500);
  return String(payload?.message || '').trim().slice(0, 500) || null;
}

class WebsiteIntegrationSync {
  constructor() { this.running = false; }

  configured() {
    return Boolean(process.env.WEBSITE_INTEGRATION_FEED_URL && process.env.WEBSITE_INTEGRATION_SECRET);
  }

  async _request(method, body = null) {
    const base = String(process.env.WEBSITE_INTEGRATION_FEED_URL || '').replace(/\/+$/, '');
    const response = await fetch(`${base}${method === 'GET' ? '?limit=100' : ''}`, {
      method,
      headers: {
        authorization: `Bearer ${process.env.WEBSITE_INTEGRATION_SECRET}`,
        ...(body ? { 'content-type': 'application/json' } : {}),
      },
      ...(body ? { body: JSON.stringify(body) } : {}),
      signal: AbortSignal.timeout(20_000),
    });
    if (!response.ok) throw new Error(`website integration ${method} failed (${response.status})`);
    return response.json();
  }

  async _findLead(email, mobile) {
    const byEmail = await prisma.$queryRaw`
      SELECT id FROM Lead WHERE lower(trim(email)) = ${email} LIMIT 1
    `;
    const emailId = Number(byEmail?.[0]?.id);
    if (Number.isInteger(emailId)) return prisma.lead.findUnique({ where: { id: emailId } });
    return mobile ? prisma.lead.findFirst({ where: { mobile } }) : null;
  }

  async _importConsentedEnquiry(payload = {}) {
    const email = normalizeEmail(payload.email);
    if (!email || payload?.consent?.granted !== true) {
      throw new Error('website consent event is missing a valid email or explicit consent');
    }
    const phone = normalizePhone(payload.phone);
    const existing = await this._findLead(email, phone);
    const consentAt = payload?.consent?.at ? new Date(payload.consent.at) : new Date();
    if (Number.isNaN(consentAt.getTime())) throw new Error('website consent timestamp is invalid');
    const consentSource = [
      String(payload?.consent?.source || 'website_enquiry_checkbox'),
      String(payload?.consent?.version || 'unknown_version'),
    ].join(':');
    const update = {
      email,
      company: String(payload.company || '').trim() || existing?.company || null,
      country: String(payload.country || '').trim() || existing?.country || null,
      product: productSummary(payload) || existing?.product || null,
      emailMarketingConsent: true,
      emailMarketingConsentAt: consentAt,
      emailMarketingConsentSource: consentSource,
      tags: combineTags(existing?.tags, ['website-enquiry', 'email-opt-in']),
    };
    if (existing) {
      await prisma.lead.update({ where: { id: existing.id }, data: update });
      return { leadId: existing.id, created: false };
    }
    const lead = await prisma.lead.create({
      data: {
        ...update,
        name: String(payload.contactName || '').trim() || 'Website buyer',
        mobile: phone || syntheticMobile(email),
        source: 'website',
        status: 'new',
        isOnWhatsApp: phone ? null : false,
        consumedAt: payload.createdAt ? new Date(payload.createdAt) : new Date(),
        leadTier: 'HOT',
      },
    });
    return { leadId: lead.id, created: true };
  }

  async _process(event) {
    if (event.eventType === 'website.enquiry.consented') {
      return this._importConsentedEnquiry(event.payload);
    }
    if (event.eventType === 'brevo.marketing.event') {
      return brevoMarketingCampaigns.reconcileWebhook(event.payload || {});
    }
    logger.warn(`Ignoring unknown website integration event type: ${event.eventType}`);
    return { ignored: true, reason: 'unknown_event_type' };
  }

  async run() {
    if (!this.configured()) return { skipped: true, reason: 'not_configured' };
    if (this.running) return { skipped: true, reason: 'already_running' };
    this.running = true;
    try {
      const response = await this._request('GET');
      const events = Array.isArray(response?.events) ? response.events : [];
      const acknowledged = [];
      const failures = [];
      for (const event of events) {
        try {
          await this._process(event);
          acknowledged.push(String(event.id));
        } catch (error) {
          failures.push({ id: String(event.id || ''), error: error.message });
        }
      }
      if (acknowledged.length) await this._request('POST', { ids: acknowledged });
      if (failures.length) logger.warn(`Website integration retained ${failures.length} event(s) for retry`);
      return { fetched: events.length, acknowledged: acknowledged.length, failed: failures.length };
    } finally {
      this.running = false;
    }
  }
}

export { WebsiteIntegrationSync, normalizeEmail, normalizePhone, syntheticMobile };
export default new WebsiteIntegrationSync();
