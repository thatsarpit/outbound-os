import { test } from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync, readdirSync, readFileSync, existsSync, rmSync, statSync, openSync, fstatSync, closeSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { DatabaseSync } from 'node:sqlite';
import { createPrismaClient } from '../src/utils/createPrismaClient.js';
import { InboundEmailIngestion, sanitizeReceivedEmailHtml } from '../src/services/inboundEmailIngestion.js';
import { InboundEmailSpool } from '../src/utils/inboundEmailSpool.js';
import { createEmailReceiptRouter } from '../src/routes/emailReceipts.js';
import express from 'express';
import { once } from 'node:events';
import { execFileSync } from 'node:child_process';
import { mkdirSync } from 'node:fs';

async function fixture(run) {
  const directory = mkdtempSync(path.join(tmpdir(), 'outbound-inbound-'));
  const filename = path.join(directory, 'fixture.db');
  const sql = new DatabaseSync(filename);
  const migrations = new URL('../prisma/migrations/', import.meta.url);
  for (const name of readdirSync(migrations).sort()) {
    const migration = new URL(`${name}/migration.sql`, migrations);
    if (existsSync(migration)) sql.exec(readFileSync(migration, 'utf8'));
  }
  const db = createPrismaClient(`file:${filename}`);
  const spool = new InboundEmailSpool({ directory: path.join(directory, 'private-mail'), secret: 'fixture-inbound-spool-key-at-least-32' });
  const events = [], scores = [];
  const service = new InboundEmailIngestion({ db, spool, publish: row => events.push(row), score: id => scores.push(id) });
  const account = await db.emailAccount.create({ data: { name: 'Fixture sender', email: 'sales@example.test', smtpHost: 'smtp.example.test', smtpUser: 'fixture', smtpPass: 'fixture' } });
  const lead = await db.lead.create({ data: { name: 'Fixture customer', mobile: 'no-phone:inbound-fixture', email: 'customer@example.test', status: 'contacted', emailStatus: 'sent' } });
  const receivedAt = new Date('2026-10-23T20:00:00Z');
  const mime = (body, extra = '', id = '<inbound-fixture@example.test>') => Buffer.from(
    `From: ${lead.email}\r\nTo: ${account.email}\r\nSubject: Re: Fixture\r\nMessage-ID: ${id}\r\n${extra}Content-Type: text/plain; charset=utf-8\r\n\r\n${body}`);
  const deliver = (rawMime, options = {}) => service.ingest({ provider: 'cloudflare', dedupeKey: 'cloudflare-inbound:fixture-event-123456', rawMime,
    envelopeFrom: lead.email, envelopeTo: [account.email], strictRecipient: true, receivedAt, ...options });
  try { await run({ db, spool, service, events, scores, account, lead, receivedAt, mime, deliver, directory }); }
  finally { await db.$disconnect(); sql.close(); rmSync(directory, { recursive: true, force: true }); }
}

test('receipt review protects originals and manually links held email only once through the real ingestion pipeline', () => fixture(async ({ db, service, deliver, mime, lead, account, events }) => {
  const raw = Buffer.from(mime('Please send the specification').toString().replaceAll(lead.email, 'unmatched@example.test'));
  const held = await deliver(raw, { envelopeFrom: 'unmatched@example.test' });
  assert.equal(held.receipt.state, 'unmatched');
  const app = express();
  app.use(express.json());
  app.use('/api', createEmailReceiptRouter({ db, service, guard: role => {
    assert.equal(role, 'admin');
    return (req, res, next) => req.headers['x-fixture-role'] === 'admin' ? next() : res.sendStatus(403);
  } }));
  const server = app.listen(0, '127.0.0.1');
  await once(server, 'listening');
  const base = `http://127.0.0.1:${server.address().port}/api/email/receipts`;
  const headers = { 'x-fixture-role': 'admin', 'Content-Type': 'application/json' };
  const retry = (id, body = {}) => fetch(`${base}/${id}/retry`, { method: 'POST', headers, body: JSON.stringify(body) });
  try {
    assert.equal((await fetch(base)).status, 403);
    assert.equal((await fetch(`${base}/${held.receipt.id}/retry`, { method: 'POST' })).status, 403);
    const listed = await (await fetch(base, { headers })).json();
    assert.equal(listed.total, 1); assert.equal(listed.items[0].canAssign, true);
    assert.ok(!JSON.stringify(listed).includes(held.receipt.rawPath));
    assert.ok(!JSON.stringify(listed).includes('payloadHash'));
    assert.equal((await retry('1junk')).status, 400);
    assert.equal((await retry(held.receipt.id, { leadId: lead.id })).status, 400);
    assert.equal((await retry(held.receipt.id, { leadId: 999999, accountId: account.id })).status, 400);
    assert.equal(await db.message.count(), 0);
    const linked = await retry(held.receipt.id, { leadId: lead.id, accountId: account.id });
    assert.equal(linked.status, 200); assert.equal((await linked.json()).state, 'matched');
    assert.equal(await db.message.count({ where: { leadId: lead.id, direction: 'inbound' } }), 1);
    assert.equal((await retry(held.receipt.id, { leadId: lead.id, accountId: account.id })).status, 409);
    assert.equal(events.length, 1);
  } finally { await new Promise(resolve => server.close(resolve)); }
}));

test('an operator retry can recover a receipt after correcting the lead directory without duplicating it', () => fixture(async ({ db, deliver, mime, lead, events }) => {
  const raw = Buffer.from(mime('Please send details').toString().replaceAll(lead.email, 'corrected@example.test'));
  const first = await deliver(raw, { envelopeFrom: 'corrected@example.test' });
  assert.equal(first.receipt.state, 'unmatched');
  await db.lead.update({ where: { id: lead.id }, data: { email: 'corrected@example.test' } });
  const retry = await deliver(raw, { envelopeFrom: 'corrected@example.test', retry: true });
  assert.equal(retry.receipt.id, first.receipt.id); assert.equal(retry.receipt.state, 'matched');
  assert.equal((await deliver(raw, { envelopeFrom: 'corrected@example.test', retry: true })).duplicate, true);
  assert.equal(await db.message.count(), 1); assert.equal(events.length, 1);
}));

test('hot backups retain immutable encrypted originals needed by the receipt snapshot', () => fixture(async ({ db, directory }) => {
  const secret = 'fixture-independent-restore-key-at-least-32';
  const privateDirectory = path.join(directory, 'private', 'inbound-email');
  const spool = new InboundEmailSpool({ directory: privateDirectory, secret });
  const key = 'imap-inbound:backup-fixture-1234';
  const first = await spool.store(key, Buffer.from('Fixture partial MIME'));
  const recovered = await spool.store(key, Buffer.from('Fixture complete MIME'));
  assert.notEqual(first, recovered);
  assert.equal((await spool.read(first, key)).toString(), 'Fixture partial MIME');
  await db.$queryRawUnsafe('PRAGMA wal_checkpoint(FULL)');
  const backupDirectory = path.join(directory, 'backups');
  execFileSync('bash', [new URL('../scripts/backup.sh', import.meta.url).pathname], { env: {
    ...process.env, OUTBOUNDOS_DB_FILE: path.join(directory, 'fixture.db'), OUTBOUNDOS_BACKUP_DIR: backupDirectory,
  }, stdio: 'pipe' });
  const files = readdirSync(backupDirectory);
  assert.ok(files.some(name => name.endsWith('.db.gz')));
  const archive = files.find(name => name.endsWith('.inbound-mail.tar.gz'));
  assert.ok(archive);
  assert.equal(statSync(path.join(backupDirectory, archive)).mode & 0o777, 0o600);
  const restored = path.join(directory, 'restored');
  mkdirSync(restored);
  execFileSync('tar', ['-xzf', path.join(backupDirectory, archive), '-C', restored]);
  const reader = new InboundEmailSpool({ directory: path.join(restored, 'private', 'inbound-email'), secret });
  assert.equal((await reader.read(first, key)).toString(), 'Fixture partial MIME');
  assert.equal((await reader.read(recovered, key)).toString(), 'Fixture complete MIME');
}));

test('shared inbound ingestion retains full text and commits a single durable activity with reply state', () => fixture(async ({ db, deliver, mime, lead, account, events, scores }) => {
  const queued = await db.message.create({ data: { leadId: lead.id, channel: 'email', direction: 'outbound', status: 'queued', content: 'Do not send after a reply' } });
  const text = 'Please send the details. '.repeat(240);
  const result = await deliver(mime(text));
  const message = await db.message.findUnique({ where: { id: result.receipt.messageId } });
  assert.equal(message.content, text.trim());
  assert.ok(message.content.length > 2000);
  assert.equal(message.emailInboundKind, 'human');
  assert.ok(message.emailReplyProcessedAt);
  assert.equal(message.emailAccountId, account.id);
  assert.equal((await db.lead.findUnique({ where: { id: lead.id } })).status, 'replied');
  assert.equal((await db.message.findUnique({ where: { id: queued.id } })).status, 'cancelled');
  assert.equal(await db.activityLog.count({ where: { type: 'email_reply', leadId: lead.id } }), 1);
  assert.equal(events.length, 1);
  assert.equal(JSON.parse(events[0].meta).threadKey, `lead:${lead.id}:email`);
  assert.deepEqual(scores, [lead.id]);
  assert.equal((await deliver(mime(text))).duplicate, true);
  assert.equal(events.length, 1);
}));

test('HTML-only, attachment-only and empty-body MIME complete successfully, without persisting active HTML', () => fixture(async ({ db, deliver, lead, account }) => {
  const raw = Buffer.from(`From: ${lead.email}\r\nTo: ${account.email}\r\nSubject: HTML fixture\r\nMessage-ID: <html@example.test>\r\nMIME-Version: 1.0\r\nContent-Type: text/html; charset=utf-8\r\n\r\n<p>Can you quote <b>five boxes</b>?</p><img src="https://tracking.example.test/a"><script>steal()</script><a href="javascript:alert(1)" onclick="bad()">bad</a>`);
  const html = await deliver(raw);
  const htmlMessage = await db.message.findUnique({ where: { id: html.receipt.messageId } });
  assert.equal(htmlMessage.status, 'delivered');
  assert.match(htmlMessage.content, /five boxes/);
  assert.doesNotMatch(htmlMessage.emailHtmlBody, /script|javascript|onclick|tracking|<img/);
  const attachment = Buffer.from(`From: ${lead.email}\r\nTo: ${account.email}\r\nSubject: Attachment fixture\r\nMessage-ID: <attachment@example.test>\r\nMIME-Version: 1.0\r\nContent-Type: multipart/mixed; boundary="fixture"\r\n\r\n--fixture\r\nContent-Type: application/pdf; name="specification.pdf"\r\nContent-Disposition: attachment; filename="specification.pdf"\r\nContent-Transfer-Encoding: base64\r\n\r\n${Buffer.from('%PDF-FICTIONAL-CONTENT').toString('base64')}\r\n--fixture--`);
  const attached = await deliver(attachment, { dedupeKey: 'cloudflare-inbound:attachment-event-1234' });
  const attachmentMessage = await db.message.findUnique({ where: { id: attached.receipt.messageId } });
  assert.equal(attachmentMessage.status, 'delivered');
  assert.match(attachmentMessage.content, /1 attachment/);
  const [metadata] = JSON.parse(attached.receipt.attachmentMetadata);
  assert.equal(metadata.filename, 'specification.pdf');
  assert.equal(metadata.contentType, 'application/pdf');
  assert.equal(metadata.size, 22);
  assert.match(metadata.sha256, /^[0-9a-f]{64}$/);
  const empty = await deliver(Buffer.from(`From: ${lead.email}\r\nTo: ${account.email}\r\nSubject: Empty fixture\r\nMessage-ID: <empty@example.test>\r\n\r\n`), { dedupeKey: 'cloudflare-inbound:empty-body-event-1234' });
  assert.equal((await db.message.findUnique({ where: { id: empty.receipt.messageId } })).status, 'delivered');
}));

test('unknown senders and ambiguous addresses are held as private receipts rather than silently discarded', () => fixture(async ({ db, spool, directory, deliver, mime, lead }) => {
  const raw = mime('A new enquiry').toString().replaceAll(lead.email, 'new-customer@example.test');
  const unmatched = await deliver(Buffer.from(raw), { envelopeFrom: 'new-customer@example.test' });
  assert.equal(unmatched.receipt.state, 'unmatched');
  assert.equal(unmatched.receipt.reason, 'unknown_sender_address');
  assert.equal(await db.message.count(), 0);
  assert.equal(await db.activityLog.count(), 0);
  assert.deepEqual(await spool.read(unmatched.receipt.rawPath, unmatched.receipt.dedupeKey), Buffer.from(raw));
  const file = path.join(directory, 'private-mail', unmatched.receipt.rawPath);
  const descriptor = openSync(file, 'r');
  try {
    assert.equal(fstatSync(descriptor).mode & 0o777, 0o600);
    assert.equal(readFileSync(descriptor).includes(Buffer.from('new-customer@example.test')), false);
  } finally { closeSync(descriptor); }
  await assert.rejects(spool.read(unmatched.receipt.rawPath, 'wrong-identity'), /authenticate/);
  await assert.rejects(spool.read('../escape.mime.enc', unmatched.receipt.dedupeKey), /Invalid inbound/);
  await db.lead.create({ data: { name: 'Second contact', mobile: 'no-phone:ambiguous-inbound', email: ` ${lead.email.toUpperCase()} ` } });
  const ambiguous = await deliver(mime('Who owns this thread?'), { dedupeKey: 'cloudflare-inbound:ambiguous-event-1234' });
  assert.equal(ambiguous.receipt.reason, 'ambiguous_sender_address');
  assert.equal(await db.message.count(), 0);
}));

test('ambiguous human replies hold all duplicate contacts without assigning a conversation or stopping unrelated work', () => fixture(async ({ db, deliver, mime, lead, events }) => {
  const duplicates = [lead];
  for (let index = 0; index < 3; index++) duplicates.push(await db.lead.create({ data: {
    name: `Duplicate ${index}`, mobile: `no-phone:duplicate-${index}`, email: ` ${lead.email.toUpperCase()} `, status: 'contacted',
  } }));
  const other = await db.lead.create({ data: { name: 'Unrelated', mobile: 'no-phone:unrelated', email: 'other@example.test' } });
  for (const contact of [...duplicates, other]) await db.message.create({ data: { leadId: contact.id, direction: 'outbound', channel: 'email', status: 'queued', content: 'Fixture outreach' } });
  await deliver(mime('Automatic reply', 'Auto-Submitted: auto-replied\r\n', '<automatic-duplicate@example.test>'), { dedupeKey: 'cloudflare-inbound:automatic-duplicate-123' });
  assert.equal(await db.message.count({ where: { status: 'queued' } }), 5);
  const result = await deliver(mime('Please stop the scheduled outreach'));
  assert.equal(result.receipt.reason, 'ambiguous_sender_address');
  assert.equal(result.receipt.messageId, null);
  assert.equal(await db.message.count({ where: { status: 'cancelled', providerStatusReason: 'inbound_email_pending_review' } }), 4);
  assert.equal(await db.message.count({ where: { leadId: other.id, status: 'queued' } }), 1);
  assert.equal(await db.message.count({ where: { direction: 'inbound' } }), 0);
  assert.equal(events.length, 0);
}));

test('backup follows a relative DATABASE_URL and refuses a receipt snapshot whose originals are missing', () => fixture(async ({ db, directory }) => {
  const script = new URL('../scripts/backup.sh', import.meta.url).pathname;
  const schema = new URL('../prisma/', import.meta.url).pathname;
  const env = { ...process.env, OUTBOUNDOS_DB_FILE: '', DATABASE_URL: `file:${path.relative(schema, path.join(directory, 'fixture.db'))}`,
    OUTBOUNDOS_BACKUP_DIR: path.join(directory, 'relative-backup') };
  execFileSync('bash', [script], { env, stdio: 'pipe' });
  assert.ok(readdirSync(env.OUTBOUNDOS_BACKUP_DIR).some(name => name.endsWith('.db.gz')));
  await db.inboundEmailReceipt.create({ data: { provider: 'cloudflare', dedupeKey: 'fixture-missing-original', payloadHash: 'fixture', envelopeFrom: '', envelopeTo: '[]', rawPath: 'missing.mime.enc' } });
  assert.throws(() => execFileSync('bash', [script], { env: { ...env, OUTBOUNDOS_BACKUP_DIR: path.join(directory, 'incomplete-backup') }, stdio: 'pipe' }), error => /originals directory is missing/.test(String(error.stderr)));
}));

test('recipient routing and outbound references are scoped before matching a strict delivery', () => fixture(async ({ db, deliver, mime, lead, account }) => {
  const other = await db.emailAccount.create({ data: { name: 'Another sender', email: 'other@example.test', smtpHost: 'smtp.example.test', smtpUser: 'fixture', smtpPass: 'fixture' } });
  const outgoing = await db.message.create({ data: { leadId: lead.id, channel: 'email', direction: 'outbound', status: 'sent', content: 'Quotation', emailAccountId: other.id, emailMessageId: '<other-outgoing@example.test>' } });
  const outside = await deliver(mime('Reply', `In-Reply-To: ${outgoing.emailMessageId}\r\n`).toString().replace(lead.email, 'unknown@example.test'), { envelopeFrom: 'unknown@example.test' });
  assert.equal(outside.receipt.reason, 'unknown_sender_address');
  const unknown = await deliver(mime('Reply'), { envelopeTo: ['not-configured@example.test'], dedupeKey: 'cloudflare-inbound:unknown-route-event' });
  assert.equal(unknown.receipt.reason, 'unknown_receiving_address');
  await db.emailAccount.update({ where: { id: account.id }, data: { enabled: false } });
  const disabled = await deliver(mime('Reply'), { dedupeKey: 'cloudflare-inbound:disabled-route-event' });
  assert.equal(disabled.receipt.reason, 'unknown_receiving_address');
  assert.equal(await db.message.count({ where: { direction: 'inbound' } }), 0);
}));

test('IMAP partial bodies hold automation then upgrade once, keeping the original outbound sender', () => fixture(async ({ db, service, account, lead, receivedAt, mime, events }) => {
  const other = await db.emailAccount.create({ data: { name: 'Original sender', email: 'original@example.test', smtpHost: 'smtp.example.test', smtpUser: 'fixture', smtpPass: 'fixture' } });
  await db.message.create({ data: { leadId: lead.id, channel: 'email', direction: 'outbound', status: 'sent', content: 'Original', emailAccountId: other.id, emailMessageId: '<original@example.test>' } });
  await db.message.create({ data: { leadId: lead.id, channel: 'whatsapp', direction: 'outbound', status: 'queued', content: 'Follow-up' } });
  const input = { provider: 'imap', dedupeKey: 'imap-inbound:partial-fixture-123456', envelopeFrom: lead.email, envelopeTo: [account.email], accountId: account.id, receivedAt };
  const raw = mime('Please send a quote', 'In-Reply-To: <original@example.test>\r\n');
  const header = Buffer.from(raw.toString().split('\r\n\r\n')[0] + '\r\n\r\n');
  const partial = await service.ingest({ ...input, rawMime: header, complete: false });
  let inbound = await db.message.findUnique({ where: { id: partial.receipt.messageId } });
  assert.equal(inbound.status, 'partial');
  assert.equal(inbound.emailInboundKind, 'pending');
  assert.equal(inbound.emailAccountId, other.id);
  assert.equal((await db.lead.findUnique({ where: { id: lead.id } })).status, 'contacted');
  assert.equal(await db.message.count({ where: { status: 'queued' } }), 0);
  const completed = await service.ingest({ ...input, rawMime: raw });
  assert.equal(completed.receipt.id, partial.receipt.id);
  inbound = await db.message.findUnique({ where: { id: inbound.id } });
  assert.equal(inbound.status, 'delivered');
  assert.equal(inbound.content, 'Please send a quote');
  assert.ok(inbound.emailReplyProcessedAt);
  await service.ingest({ ...input, rawMime: raw });
  assert.equal(events.length, 1);
  assert.equal(await db.message.count({ where: { direction: 'inbound' } }), 1);
  assert.equal((await db.lead.findUnique({ where: { id: lead.id } })).status, 'replied');
}));

test('delivery reports and auto replies remain visible without engagement or canceling queued work', () => fixture(async ({ db, deliver, mime, lead, events, scores }) => {
  await db.message.create({ data: { leadId: lead.id, channel: 'email', direction: 'outbound', status: 'queued', content: 'Fixture queued' } });
  const automatic = await deliver(mime('I am away', 'Auto-Submitted: auto-replied\r\n'));
  assert.equal((await db.message.findUnique({ where: { id: automatic.receipt.messageId } })).emailInboundKind, 'automatic_reply');
  const report = await deliver(mime('Delivery failed', 'Auto-Submitted: auto-generated\r\n', '<report@example.test>'), { dedupeKey: 'cloudflare-inbound:report-event-123456' });
  assert.equal(report.humanReply, false);
  assert.equal(await db.message.count({ where: { status: 'queued' } }), 1);
  assert.equal((await db.lead.findUnique({ where: { id: lead.id } })).status, 'contacted');
  assert.equal(events.length, 0);
  assert.equal(scores.length, 0);
}));

test('cross-transport overlap, concurrent replay and reused identities cannot duplicate or overwrite a reply', () => fixture(async ({ db, deliver, mime, lead, account, receivedAt, service, events }) => {
  const raw = mime('Reply once');
  await Promise.all([deliver(raw), deliver(raw), deliver(raw)]);
  const overlap = await service.ingest({ provider: 'imap', rawMime: raw, dedupeKey: 'imap-inbound:overlapping-fixture-123456', envelopeFrom: lead.email, envelopeTo: [account.email], accountId: account.id, receivedAt });
  assert.equal(overlap.humanReply, false);
  assert.equal(await db.message.count(), 1);
  assert.equal(events.length, 1);
  await assert.rejects(deliver(mime('Changed payload')), error => error.statusCode === 409);
  await assert.rejects(deliver(raw, { envelopeTo: ['other@example.test'] }), error => error.statusCode === 409);
  const conflict = await deliver(mime('Spoofed content with reused Message-ID'), { dedupeKey: 'cloudflare-inbound:conflicting-message' });
  assert.equal(conflict.receipt.state, 'conflict');
  assert.equal((await db.message.findFirst()).content, 'Reply once');
  assert.equal(await db.activityLog.count(), 1);
}));

test('storage failure leaves a retryable receipt without inventing a message, and publish failure keeps committed activity', () => fixture(async ({ db, spool, service, mime, deliver, events }) => {
  const original = spool.store;
  spool.store = async () => { throw new Error('fixture storage unavailable'); };
  await assert.rejects(deliver(mime('A durable reply')), /storage unavailable/);
  assert.equal((await db.inboundEmailReceipt.findFirst()).state, 'pending');
  assert.equal(await db.message.count(), 0);
  assert.equal(events.length, 0);
  spool.store = original;
  service.publish = () => { throw new Error('fixture live browser unavailable'); };
  const accepted = await deliver(mime('A durable reply'));
  assert.equal(accepted.receipt.state, 'matched');
  assert.equal(await db.activityLog.count(), 1);
  assert.equal(await db.message.count(), 1);
}));

test('recovering a legacy partial does not repeat human side effects or unpause/unsuppress a contact', () => fixture(async ({ db, service, deliver, mime, lead, account, receivedAt, events }) => {
  const legacy = await db.message.create({ data: { leadId: lead.id, channel: 'email', direction: 'inbound', status: 'partial', content: 'Legacy placeholder', emailMessageId: '<inbound-fixture@example.test>', emailAccountId: account.id } });
  await service.ingest({ provider: 'imap', rawMime: mime('Recovered body'), dedupeKey: 'imap-inbound:legacy-fixture-recovery', envelopeFrom: lead.email, envelopeTo: [account.email], accountId: account.id, receivedAt });
  const recovered = await db.message.findUnique({ where: { id: legacy.id } });
  assert.equal(recovered.content, 'Recovered body');
  assert.ok(recovered.emailReplyProcessedAt);
  assert.equal(events.length, 0);
  await db.lead.update({ where: { id: lead.id }, data: { status: 'paused', emailOptOut: true, emailStatus: 'suppressed' } });
  await db.message.create({ data: { leadId: lead.id, channel: 'email', direction: 'outbound', status: 'queued', content: 'Never send this' } });
  await deliver(mime('Stop contacting me', '', '<stop@example.test>'));
  const current = await db.lead.findUnique({ where: { id: lead.id } });
  assert.equal(current.status, 'paused');
  assert.equal(current.emailStatus, 'suppressed');
  assert.equal(current.emailOptOut, true);
  assert.equal(await db.message.count({ where: { status: 'queued' } }), 0);
}));

test('headerless invalid MIME is retained for review and HTML links cannot run scripts', () => fixture(async ({ deliver, db }) => {
  const invalid = await deliver(Buffer.from('not a MIME message'));
  assert.equal(invalid.receipt.state, 'invalid');
  assert.equal(await db.message.count(), 0);
  const safe = sanitizeReceivedEmailHtml('<a href="//example.test">relative</a><a href="https://example.test">safe</a><style>body{display:none}</style>');
  assert.doesNotMatch(safe, /href="\/\/|style/);
  assert.match(safe, /rel="noopener noreferrer"/);
}));
