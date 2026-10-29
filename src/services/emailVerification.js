import { Resolver } from 'node:dns/promises';
import { randomUUID } from 'node:crypto';
import prisma from '../utils/prismaClient.js';
import logger from '../utils/logger.js';
import { checkEmailAddress, emailIdentity, verificationEnabled } from '../utils/emailVerification.js';

const DAY = 24 * 3600_000;
export class EmailVerificationService {
  constructor({ db = prisma, lookupMx } = {}) {
    this.db = db;
    this.lookupMx = lookupMx || (async domain => new Resolver({ timeout: 2500, tries: 1 }).resolveMx(domain));
    this.domains = new Map();
    this.active = 0;
    this.waiters = [];
    this.running = false;
  }
  async domainMx(domain) {
    const cached = this.domains.get(domain);
    if (cached && cached.until > Date.now()) return cached.promise;
    if (this.domains.size >= 5000) this.domains.delete(this.domains.keys().next().value);
    const promise = (async () => {
      if (this.active >= 8) await new Promise(resolve => this.waiters.push(resolve));
      else this.active++;
      try { return await this.lookupMx(domain); }
      finally { const next = this.waiters.shift(); if (next) next(); else this.active--; }
    })();
    // Keep temporary resolver failures short-lived; every recipient still gets
    // its own durable result and no full address is sent to a third-party API.
    const entry = { until: Date.now() + 3600_000, promise };
    promise.catch(() => { entry.until = Date.now() + 60_000; });
    this.domains.set(domain, entry);
    return promise;
  }
  async verify(input, { force = false } = {}) {
    const email = emailIdentity(input);
    const saved = await this.db.emailVerification.findUnique({ where: { email } });
    if (!force && saved && saved.expiresAt > new Date()) return JSON.parse(saved.result);
    const result = await checkEmailAddress(email, domain => this.domainMx(domain));
    const checkedAt = new Date();
    const data = { status: result.status, reason: result.reason, result: JSON.stringify(result),
      checkedAt, expiresAt: new Date(Date.now() + (result.status === 'unknown' ? 15 * 60_000 : DAY)) };
    await this.db.emailVerification.upsert({ where: { email }, create: { email, ...data }, update: data });
    return result;
  }
  async assertRecipients(addresses) {
    if (!verificationEnabled()) return;
    const unique = [...new Set(addresses.map(emailIdentity))];
    if (!unique.length || unique.length > 1000) throw new Error('Choose between 1 and 1,000 email recipients per send.');
    const results = [];
    // Bound concurrent work across domains and requests, including manual sends.
    for (let at = 0; at < unique.length; at += 8) results.push(...await Promise.all(unique.slice(at, at + 8).map(email => this.verify(email))));
    const failed = results.find(result => !result.canSend);
    if (failed) {
      const error = new Error(`Email verification blocked delivery: ${failed.reason.replace(/_/g, ' ')}. Review the email address in Email verification.`);
      error.code = 'email_verification_required'; error.statusCode = 422;
      throw error;
    }
  }
  async readyEmails(addresses) {
    if (!verificationEnabled()) return null;
    const emails = [...new Set(addresses.map(emailIdentity).filter(Boolean))], ready = new Set();
    for (let at = 0; at < emails.length; at += 500) {
      const rows = await this.db.emailVerification.findMany({ where: { email: { in: emails.slice(at, at + 500) }, status: 'ready', expiresAt: { gt: new Date() } }, select: { email: true } });
      rows.forEach(row => ready.add(row.email));
    }
    return ready;
  }
  async createJob(emails) {
    const unique = [...new Set(emails.map(emailIdentity).filter(Boolean))];
    if (!unique.length || unique.length > 20000 || unique.some(email => email.length > 320)) throw new Error('Choose 1–20,000 email addresses, each at most 320 characters.');
    const job = await this.db.$transaction(async tx => {
      if (await tx.emailVerificationJob.count({ where: { status: { in: ['queued', 'running'] } } }) >= 5) {
        throw new Error('Five verification batches are already waiting. Let one finish first.');
      }
      return tx.emailVerificationJob.create({ data: { id: randomUUID(), emails: JSON.stringify(unique), total: unique.length } });
    });
    this.kick();
    return this.publicJob(job);
  }
  publicJob({ emails, ...job }) { return { ...job, counts: JSON.parse(job.counts || '{}'), checks: 'syntax_disposable_mx', mailboxVerified: false }; }
  async resume() {
    await this.db.emailVerificationJob.updateMany({ where: { status: 'running' }, data: { status: 'queued' } });
    this.kick();
  }
  kick() { void this.drain().catch(() => logger.error('Email verification queue is unavailable; retained batches will resume after restart.')); }
  async drain() {
    if (this.running) return;
    this.running = true;
    try {
      for (;;) {
        const job = await this.db.emailVerificationJob.findFirst({ where: { status: 'queued' }, orderBy: { createdAt: 'asc' } });
        if (!job) break;
        const claimed = await this.db.emailVerificationJob.updateMany({ where: { id: job.id, status: 'queued' }, data: { status: 'running', error: null } });
        if (!claimed.count) continue;
        try {
          const emails = JSON.parse(job.emails), counts = { ready: 0, invalid: 0, unknown: 0 };
          for (let at = 0; at < emails.length; at += 8) {
            const results = await Promise.all(emails.slice(at, at + 8).map(email => this.verify(email)));
            await this.db.$transaction(results.map(result => this.db.emailVerificationJobResult.upsert({
              where: { jobId_email: { jobId: job.id, email: result.email } },
              create: { jobId: job.id, email: result.email, result: JSON.stringify(result) },
              update: { result: JSON.stringify(result), checkedAt: new Date() },
            })));
            for (const result of results) counts[result.status]++;
            await this.db.emailVerificationJob.update({ where: { id: job.id }, data: { checked: Math.min(at + 8, emails.length), counts: JSON.stringify(counts) } });
          }
          await this.db.emailVerificationJob.update({ where: { id: job.id }, data: { status: 'completed', completedAt: new Date() } });
        } catch {
          await this.db.emailVerificationJob.update({ where: { id: job.id }, data: { status: 'failed', error: 'Verification paused after a storage or resolver failure. Start another batch to reuse completed checks.' } });
        }
      }
    } finally {
      this.running = false;
      // A request can append a job between the last empty read and releasing
      // this worker. Check once after releasing it so that job cannot be lost.
      if (await this.db.emailVerificationJob.count({ where: { status: 'queued' } })) this.kick();
    }
  }
}
export default new EmailVerificationService();
