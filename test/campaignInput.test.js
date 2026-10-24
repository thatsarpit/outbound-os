import { test } from 'node:test';
import assert from 'node:assert/strict';
import { campaignInput } from '../src/services/campaignInput.js';

const base = { name: 'Owned fixture', messageTemplate: 'Hello', channel: 'both', emailSubject: 'Enquiry' };
const db = {
  emailAccount: { findUnique: async ({ where }) => ({ id: where.id, enabled: true, status: 'verified' }) },
  whatsAppAccount: { findUnique: async ({ where }) => ({ id: where.id, enabled: true, cloudApiPhoneId: 'fixture-phone-id', cloudApiToken: 'fixture-token' }) },
};
test('mixed campaigns keep email and WhatsApp senders in different ID spaces', async () => {
  const value = await campaignInput({ ...base, senderAccountId: 7, whatsappSenderAccountId: 2, waCampaignName: ' enquiry ' }, { db });
  assert.equal(value.emailSenderAccountId, 7);
  assert.equal(value.whatsappSenderAccountId, 2);
  assert.equal(value.waCampaignName, 'enquiry');
});
test('changing channel cannot reinterpret a legacy WhatsApp ID as an email ID', async () => {
  const value = await campaignInput({ channel: 'email', emailSubject: 'New enquiry' }, { db, existing: { ...base, channel: 'whatsapp', senderAccountId: 4 } });
  assert.equal(value.senderAccountId, null);
  assert.equal(value.emailSenderAccountId, null);
});
test('invalid input and unavailable sender fail before a campaign can be saved', async () => {
  for (const patch of [{ name: ' ' }, { targetFilter: '[]' }, { emailSenderAccountId: '2' }, { channel: 'other' }]) {
    await assert.rejects(campaignInput({ ...base, ...patch }, { db }), error => error.statusCode === 400);
  }
  await assert.rejects(campaignInput({ ...base, emailSenderAccountId: 1 }, { db: { emailAccount: { findUnique: async () => ({ enabled: false }) } } }), /verified email sender/);
});
test('clearing a typed sender does not restore the legacy sender', async () => {
  const email = await campaignInput({ emailSenderAccountId: null }, { db, existing: { ...base, senderAccountId: 7, emailSenderAccountId: 7 } });
  assert.equal(email.senderAccountId, null);
  assert.equal(email.emailSenderAccountId, null);
  const whatsapp = await campaignInput({ whatsappSenderAccountId: null }, { db, existing: { ...base, channel: 'whatsapp', senderAccountId: 4, whatsappSenderAccountId: 4 } });
  assert.equal(whatsapp.senderAccountId, null);
  assert.equal(whatsapp.whatsappSenderAccountId, null);
});
