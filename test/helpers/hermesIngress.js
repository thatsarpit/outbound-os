import path from 'node:path';
import { harness } from './hermesHarness.js';

// Dependency-backed harness: imports remain lazy so process-only tests need no packages.
export async function emailHarness() {
  const f = harness();
  let db;
  try {
    const { createPrismaClient } = await import('../../src/utils/createPrismaClient.js');
    const { InboundEmailIngestion } = await import('../../src/services/inboundEmailIngestion.js');
    const { InboundEmailSpool } = await import('../../src/utils/inboundEmailSpool.js');
    db = createPrismaClient(`file:${f.senderFile}`);
    const account = await db.emailAccount.create({ data: { name: 'Synthetic account', email: 'sales@example.test',
      smtpHost: 'smtp.example.test', smtpUser: 'synthetic', smtpPass: 'synthetic' } });
    await db.lead.update({ where: { id: 1 }, data: { email: 'customer@example.test', status: 'contacted' } });
    const events = [], scores = [];
    const spool = new InboundEmailSpool({ directory: path.join(f.directory, 'mail'), secret: 'synthetic-spool-secret-at-least-32' });
    const service = new InboundEmailIngestion({ db, spool, publish: row => events.push(row), score: id => scores.push(id) });
    return { db, sql: f.db, service, account, events, scores,
      mime(body, { id = '<synthetic-overlap@example.test>', from = 'customer@example.test', extra = '' } = {}) {
        return Buffer.from(`From: ${from}\r\nTo: ${account.email}\r\nSubject: Synthetic\r\nMessage-ID: ${id}\r\n${extra}Content-Type: text/plain; charset=utf-8\r\n\r\n${body}`);
      },
      deliver(rawMime, { provider = 'imap', dedupeKey = `${provider}-synthetic-overlap`, ...options } = {}) {
        return service.ingest({ provider, dedupeKey, rawMime, envelopeFrom: 'customer@example.test',
          envelopeTo: [account.email], accountId: account.id, strictRecipient: true, ...options });
      },
      eventCount() { return f.db.prepare('SELECT count(*) n FROM HermesInboundEvent').get().n; },
      async close() { try { await db.$disconnect(); } finally { await f.close(); } },
    };
  } catch (error) {
    try { await db?.$disconnect(); } finally { await f.close(); }
    throw error;
  }
}
