import { test } from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync, readdirSync, readFileSync, existsSync, rmSync, writeFileSync, truncateSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { once } from 'node:events';
import { DatabaseSync } from 'node:sqlite';
import express from 'express';
import { createPrismaClient } from '../src/utils/createPrismaClient.js';
import { InboundEmailIngestion } from '../src/services/inboundEmailIngestion.js';
import { InboundEmailAttachments } from '../src/services/inboundEmailAttachments.js';
import { InboundEmailSpool } from '../src/utils/inboundEmailSpool.js';
import { emailAttachmentDisposition, emailAttachmentHash, readEmailAttachmentMetadata } from '../src/utils/emailAttachments.js';
import { EMAIL_INGRESS_MAX_BYTES } from '../src/utils/emailIngressSignature.js';
import { createEmailAttachmentRouter } from '../src/routes/emailAttachments.js';
import { createEmailReceiptRouter } from '../src/routes/emailReceipts.js';

const bytes = Buffer.from('Fixture attachment bytes\n');
const mime = (from = 'buyer@example.test', body = 'Full customer enquiry. '.repeat(180)) => Buffer.from([
  `From: ${from}`, 'To: sales@example.test', 'Subject: Retained attachment fixture',
  'Message-ID: <attachment-download@example.test>', 'MIME-Version: 1.0',
  'Content-Type: multipart/mixed; boundary="fixture-download"', '', '--fixture-download',
  'Content-Type: text/plain; charset=utf-8', '', body, '--fixture-download',
  'Content-Type: text/plain; name="specification.txt"',
  'Content-Disposition: attachment; filename="specification.txt"', 'Content-Transfer-Encoding: base64',
  '', bytes.toString('base64'), '--fixture-download--', '',
].join('\r\n'));

async function fixture(run) {
  const directory = mkdtempSync(path.join(tmpdir(), 'outbound-attachment-'));
  const sql = new DatabaseSync(path.join(directory, 'fixture.db'));
  const migrations = new URL('../prisma/migrations/', import.meta.url);
  for (const name of readdirSync(migrations).sort()) {
    const file = new URL(`${name}/migration.sql`, migrations);
    if (existsSync(file)) sql.exec(readFileSync(file, 'utf8'));
  }
  const db = createPrismaClient(`file:${path.join(directory, 'fixture.db')}`);
  const spool = new InboundEmailSpool({ directory, secret: 'fixture-private-mail-secret-at-least-32' });
  const account = await db.emailAccount.create({ data: { email: 'sales@example.test', name: 'Fixture sender', smtpHost: 'smtp.example.test', smtpPass: 'fixture', smtpUser: 'fixture' } });
  const lead = await db.lead.create({ data: { name: 'Fixture buyer', email: 'buyer@example.test', mobile: 'no-phone:attachment-fixture' } });
  const ingestion = new InboundEmailIngestion({ db, spool, publish: () => {}, score: () => {} });
  const service = new InboundEmailAttachments({ db, spool });
  const deliver = (raw = mime(), from = lead.email) => ingestion.ingest({ provider: 'cloudflare', dedupeKey: `fixture-attachment-${from}`, rawMime: raw, envelopeFrom: from, envelopeTo: [account.email], strictRecipient: true });
  try { await run({ db, spool, service, ingestion, account, lead, deliver, directory }); }
  finally { await db.$disconnect(); sql.close(); rmSync(directory, { recursive: true, force: true }); }
}

test('matched email attachments download exact bytes without exposing private storage metadata', () => fixture(async ({ service, deliver }) => {
  const { receipt } = await deliver();
  const listed = await service.list(receipt.messageId);
  assert.deepEqual(listed, { retained: true, items: [{ index: 0, filename: 'specification.txt', contentType: 'text/plain', size: bytes.length }] });
  const file = await service.download(receipt.messageId, 0);
  assert.deepEqual(file.bytes, bytes);
  assert.equal(file.filename, 'specification.txt');
  assert.ok(!JSON.stringify(listed).includes('sha256'));
  assert.ok(!JSON.stringify(listed).includes(receipt.rawPath));
  const preview = await service.previewReceipt(receipt.id);
  assert.ok(preview.text.length > 2000);
  assert.equal(preview.subject, 'Retained attachment fixture');
  assert.deepEqual(preview.items, listed.items);
}));

test('held mail is readable by receipt without creating or linking a customer conversation', () => fixture(async ({ service, deliver, db }) => {
  const { receipt } = await deliver(mime('unknown@example.test'), 'unknown@example.test');
  assert.equal(receipt.state, 'unmatched');
  assert.equal(receipt.messageId, null);
  assert.match((await service.previewReceipt(receipt.id)).text, /customer enquiry/);
  assert.deepEqual((await service.downloadReceipt(receipt.id, 0)).bytes, bytes);
  assert.equal(await db.message.count(), 0);
  assert.equal((await db.inboundEmailReceipt.findUnique({ where: { id: receipt.id } })).state, 'unmatched');
}));

test('attachment lists recover missing legacy metadata from a verified retained original', () => fixture(async ({ service, deliver, db }) => {
  const { receipt } = await deliver();
  await db.inboundEmailReceipt.update({ where: { id: receipt.id }, data: { attachmentMetadata: null } });
  assert.equal((await service.list(receipt.messageId)).items[0].filename, 'specification.txt');
  assert.deepEqual((await service.download(receipt.messageId, 0)).bytes, bytes);
  await db.inboundEmailReceipt.update({ where: { id: receipt.id }, data: { payloadHash: '0'.repeat(64) } });
  await assert.rejects(service.list(receipt.messageId), /integrity/);
}));

test('legacy messages distinguish an unavailable original from an email with no attachments', () => fixture(async ({ service, db, lead, account, deliver }) => {
  const legacy = await db.message.create({ data: { leadId: lead.id, direction: 'inbound', channel: 'email', emailAccountId: account.id, content: 'Legacy preview' } });
  assert.deepEqual(await service.list(legacy.id), { retained: false, items: [] });
  await assert.rejects(service.download(legacy.id, 0), { statusCode: 404 });
  const raw = Buffer.from('From: buyer@example.test\r\nTo: sales@example.test\r\nSubject: No files\r\n\r\nAn ordinary reply.');
  const { receipt } = await deliver(raw);
  assert.deepEqual(await service.list(receipt.messageId), { retained: true, items: [] });
  await assert.rejects(service.download(receipt.messageId, 0), { statusCode: 404 });
}));

test('attachments cannot come from a different account or an outbound/non-email message', () => fixture(async ({ db, service, deliver, lead, account }) => {
  const { receipt } = await deliver();
  const other = await db.emailAccount.create({ data: { name: 'Other fixture', email: 'other@example.test', smtpHost: 'smtp.example.test', smtpUser: 'fixture', smtpPass: 'fixture' } });
  await db.message.update({ where: { id: receipt.messageId }, data: { emailAccountId: other.id } });
  assert.equal((await service.list(receipt.messageId)).retained, false);
  await assert.rejects(service.download(receipt.messageId, 0), { statusCode: 404 });
  for (const [channel, direction] of [['email', 'outbound'], ['whatsapp', 'inbound']]) {
    const message = await db.message.create({ data: { leadId: lead.id, channel, direction, emailAccountId: account.id, content: 'Fixture message' } });
    await assert.rejects(service.list(message.id), { statusCode: 404 });
  }
  await assert.rejects(service.list(99999999), { statusCode: 404 });
}));

test('corrupt originals, payload hashes and stored attachment metadata fail closed', () => fixture(async ({ db, service, deliver, spool, directory }) => {
  const { receipt } = await deliver();
  await db.inboundEmailReceipt.update({ where: { id: receipt.id }, data: { payloadHash: '0'.repeat(64) } });
  await assert.rejects(service.download(receipt.messageId, 0), /integrity/);
  await db.inboundEmailReceipt.update({ where: { id: receipt.id }, data: { payloadHash: receipt.payloadHash, attachmentMetadata: JSON.stringify([{ ...JSON.parse(receipt.attachmentMetadata)[0], sha256: '0'.repeat(64) }]) } });
  await assert.rejects(service.previewReceipt(receipt.id), /integrity/);
  await db.inboundEmailReceipt.update({ where: { id: receipt.id }, data: { attachmentMetadata: receipt.attachmentMetadata } });
  const target = path.join(directory, receipt.rawPath);
  const corrupted = readFileSync(target); corrupted[corrupted.length - 1] ^= 1; writeFileSync(target, corrupted);
  await assert.rejects(service.downloadReceipt(receipt.id, 0), /authenticate/);
  await assert.rejects(spool.read(receipt.rawPath, 'wrong-key'), /authenticate/);
  assert.equal(service.active, 0);
}));

test('retained email parsing rejects concurrent excess work and releases capacity on failure', async () => {
  const raw = Buffer.from('fixture-original');
  const receipt = { rawPath: 'fixture', dedupeKey: 'fixture', payloadHash: emailAttachmentHash(raw), attachmentMetadata: null };
  let finish;
  const service = new InboundEmailAttachments({ maxConcurrent: 1, spool: { read: () => new Promise(resolve => { finish = resolve; }) }, parse: async () => { throw new Error('Fixture parse failure'); } });
  const first = service.withOriginal(receipt, () => {});
  await assert.rejects(service.withOriginal(receipt, () => {}), { statusCode: 503 });
  finish(raw);
  await assert.rejects(first, /Fixture parse failure/);
  assert.equal(service.active, 0);
});

test('encrypted spool rejects oversized files before allocating or parsing them', () => fixture(async ({ directory, spool }) => {
  const name = `${'a'.repeat(64)}.mime.enc`;
  writeFileSync(path.join(directory, name), 'OSEM1');
  truncateSync(path.join(directory, name), EMAIL_INGRESS_MAX_BYTES + 34);
  await assert.rejects(spool.read(name, 'fixture'), /Invalid encrypted email size/);
}));

test('download filenames cannot inject headers or become paths, and retained metadata is validated', () => {
  const disposition = emailAttachmentDisposition('../invoice\r\nHeader: injected/报价.txt');
  assert.ok(disposition.startsWith('attachment;'));
  assert.ok(!/[\r\n]/.test(disposition));
  assert.match(disposition, /filename\*=UTF-8''/);
  assert.ok(!disposition.includes('../'));
  assert.doesNotThrow(() => emailAttachmentDisposition('broken\ud800.txt'));
  assert.doesNotThrow(() => emailAttachmentDisposition('📄'.repeat(200)));
  for (const invalid of ['null', '{}', '[{"filename":"test"}]']) assert.throws(() => readEmailAttachmentMetadata(invalid));
});

test('HTTP attachment routes enforce roles, exact identifiers and private forced downloads', () => fixture(async ({ db, service, ingestion, deliver }) => {
  const { receipt } = await deliver();
  const guard = role => (req, res, next) => role === 'admin' ? req.headers['x-fixture-role'] === 'admin' ? next() : res.sendStatus(403) : ['admin', 'viewer'].includes(req.headers['x-fixture-role']) ? next() : res.sendStatus(403);
  const app = express(); app.use(express.json());
  app.use('/api', createEmailAttachmentRouter({ service, guard }));
  app.use('/api', createEmailReceiptRouter({ db, service: ingestion, originals: service, guard }));
  const server = app.listen(0, '127.0.0.1'); await once(server, 'listening');
  const base = `http://127.0.0.1:${server.address().port}/api`;
  const viewer = { headers: { 'x-fixture-role': 'viewer' } }, admin = { headers: { 'x-fixture-role': 'admin' } };
  try {
    const endpoint = `${base}/messages/${receipt.messageId}/email-attachments`;
    assert.equal((await fetch(endpoint)).status, 403);
    assert.equal((await fetch(`${base}/email/receipts/${receipt.id}`, viewer)).status, 403);
    assert.equal((await fetch(`${base}/email/receipts/${receipt.id}/attachments/0`, viewer)).status, 403);
    assert.equal((await fetch(`${base}/messages/1junk/email-attachments`, viewer)).status, 400);
    for (const index of ['-1', '0junk', '01', '9007199254740992']) assert.equal((await fetch(`${endpoint}/${index}`, viewer)).status, 400);
    assert.equal((await fetch(`${endpoint}/99`, viewer)).status, 404);
    const listed = await fetch(endpoint, viewer);
    assert.equal(listed.headers.get('cache-control'), 'no-store');
    const file = await fetch(`${endpoint}/0`, viewer);
    assert.equal(file.status, 200);
    assert.equal(file.headers.get('content-type'), 'application/octet-stream');
    assert.equal(file.headers.get('x-content-type-options'), 'nosniff');
    assert.match(file.headers.get('content-disposition'), /^attachment;/);
    assert.match(file.headers.get('content-security-policy'), /sandbox/);
    assert.deepEqual(Buffer.from(await file.arrayBuffer()), bytes);
    const preview = await fetch(`${base}/email/receipts/${receipt.id}`, admin);
    assert.equal(preview.status, 200); assert.equal(preview.headers.get('cache-control'), 'no-store');
    const data = await preview.json(); assert.ok(data.text.length > 2000); assert.ok(!JSON.stringify(data).includes(receipt.rawPath));
    assert.deepEqual(Buffer.from(await (await fetch(`${base}/email/receipts/${receipt.id}/attachments/0`, admin)).arrayBuffer()), bytes);
    assert.equal((await fetch(`${base}/email/receipts/1junk`, admin)).status, 400);
  } finally { await new Promise(resolve => server.close(resolve)); }
}));


test('multipart HTML-only body with an attachment remains readable in the inbox and receipt review', () => fixture(async ({ db, spool, account, lead }) => {
  const ingestion = new InboundEmailIngestion({ db, spool, publish: async () => {}, score: async () => {} });
  const raw = Buffer.from(mime(lead.email, '<html><body><p>Please quote <b>five boxes</b> &amp; delivery.</p><script>steal()</script><img src="https://tracking.example.test/a"><a href="javascript:alert(1)">Details</a></body></html>').toString()
    .replace('Content-Type: text/plain; charset=utf-8', 'Content-Type: text/html; charset=utf-8'));
  const { receipt } = await ingestion.ingest({ provider: 'cloudflare', dedupeKey: 'cloudflare-inbound:html-attachment-fixture', rawMime: raw, envelopeFrom: lead.email, envelopeTo: [account.email], strictRecipient: true });
  const message = await db.message.findUnique({ where: { id: receipt.messageId } });
  assert.match(message.content, /Please quote five boxes & delivery/);
  assert.doesNotMatch(message.content, /steal|javascript|tracking/);
  const service = new InboundEmailAttachments({ db, spool });
  const preview = await service.previewReceipt(receipt.id);
  assert.match(preview.text, /Please quote five boxes & delivery/);
  assert.doesNotMatch(preview.text, /steal|javascript|tracking/);
  assert.equal(preview.items.length, 1);
  assert.deepEqual((await service.downloadReceipt(receipt.id, 0)).bytes, bytes);
}));
