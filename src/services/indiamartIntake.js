import prisma from '../utils/prismaClient.js';
import freshLeadOutreach from './freshLeadOutreach.js';
import { importConnectorRecords } from './connectorImport.js';
import logger from '../utils/logger.js';

export const INDIAMART_SOURCE = 'indiamart_live';
export const INDIAMART_POLICY = 'indiamart.livePolicy';
export class IndiamartIntake {
  constructor({ db = prisma, outreach = freshLeadOutreach } = {}) {
    this.db = db; this.outreach = outreach; this.running = false;
  }
  async policy() {
    const row = await this.db.systemConfig.findUnique({ where: { key: INDIAMART_POLICY } });
    return row ? JSON.parse(row.value) : null;
  }
  async ingest(source, records, mode, sellerId) {
    const policy = await this.policy();
    if (!policy || policy.sourceId !== source.id || source.source !== INDIAMART_SOURCE
      || String(sellerId) !== policy.sellerId || !policy.sellerId) throw new Error('Seller account is not configured for this source.');
    if (!['baseline', 'live'].includes(mode)) throw new Error('Choose baseline or live mode.');
    if (mode === 'live' && !policy.armedAt) throw new Error('Complete the initial baseline first.');
    const results = await importConnectorRecords(this.db, source, records, { intakeMode: mode, liveAfter: policy.armedAt });
    if (mode === 'baseline' && !policy.armedAt) {
      policy.armedAt = new Date().toISOString();
      await this.db.systemConfig.update({ where: { key: INDIAMART_POLICY }, data: { value: JSON.stringify(policy) } });
    }
    this.kick();
    return { results, baseline: mode === 'baseline', armedAt: policy.armedAt, automationEnabled: policy.enabled === true };
  }
  async health() {
    const policy = await this.policy();
    if (!policy) return { configured: false, enabled: false };
    const row = await this.db.systemConfig.findUnique({ where: { key: 'indiamart.liveHealth' } });
    const health = row ? JSON.parse(row.value) : {};
    const pending = await this.db.connectorReceipt.count({ where: { sourceId: policy.sourceId, liveState: { in: ['pending', 'queuing'] } } });
    return { configured: true, enabled: policy.enabled === true, baselineComplete: Boolean(policy.armedAt),
      ...health, stale: !health.reportedAt || Date.now() - Date.parse(health.reportedAt) > 35 * 60_000, pending };
  }
  kick() { void this.drain().catch(() => logger.error('IndiaMART intake queue unavailable; retained purchases will resume.')); }
  async drain() {
    if (this.running) return;
    this.running = true;
    try {
      const policy = await this.policy();
      if (!policy?.enabled || !policy.armedAt) return;
      const source = await this.db.webhookSource.findUnique({ where: { id: policy.sourceId } });
      if (!source?.enabled || source.source !== INDIAMART_SOURCE) return;
      const [wa, email] = await Promise.all([
        this.db.whatsAppAccount.findUnique({ where: { id: policy.whatsappAccountId } }),
        this.db.emailAccount.findUnique({ where: { id: policy.emailAccountId } }),
      ]);
      if (!wa?.enabled || !email?.enabled || email.whatsappAccountId !== wa.id || !policy.templateName) return;
      const rows = await this.db.connectorReceipt.findMany({ where: { sourceId: source.id, liveState: { in: ['pending', 'queuing'] } }, orderBy: { id: 'asc' }, take: 50 });
      for (const row of rows) {
        try {
          let lead = row.leadId && await this.db.lead.findUnique({ where: { id: row.leadId } });
          if (!lead || lead.source !== source.source) throw new Error('Contact is no longer owned by this intake.');
          if (row.liveState === 'pending') {
            // Never undo an operator's pause/edit after the import. Keep the
            // original row version as the hand-off between import and outreach.
            await this.db.$transaction(async tx => {
              const moved = await tx.lead.updateMany({ where: { id: lead.id, status: 'paused', updatedAt: row.liveLeadVersion }, data: { status: 'new' } });
              if (!moved.count) throw new Error('Contact changed after import; review before outreach.');
              await tx.connectorReceipt.update({ where: { id: row.id }, data: { liveState: 'queuing' } });
            });
            lead = await this.db.lead.findUnique({ where: { id: lead.id } });
          }
          const summary = await this.outreach.queue(lead, { channels: ['whatsapp', 'email'],
            whatsappAccountId: policy.whatsappAccountId, emailAccountId: policy.emailAccountId, templateName: policy.templateName });
          if (summary.skipped) throw new Error('Contact is paused, replied or closed.');
          await this.outreach.dispatchNow([lead]);
          await this.db.connectorReceipt.update({ where: { id: row.id }, data: { liveState: 'queued', liveError: null } });
        } catch (error) {
          // Storage failures retain work for the next tick. Explicit operator
          // changes block the purchase rather than reviving a paused contact.
          if (/Contact/.test(error.message)) await this.db.connectorReceipt.update({ where: { id: row.id }, data: { liveState: 'blocked', liveError: error.message } });
          else logger.warn('IndiaMART first-touch queue will retry a retained purchase.');
        }
      }
    } finally { this.running = false; }
  }
}
export default new IndiamartIntake();
