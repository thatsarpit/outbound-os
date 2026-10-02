import { test } from 'node:test';
import assert from 'node:assert/strict';
import { parse } from 'csv-parse/sync';
import { leadsToCsv } from '../src/utils/leadCsv.js';

test('CSV preserves WhatsApp identities and hides internal phone placeholders', () => {
  const createdAt = new Date('2026-10-03T00:00:00Z');
  const csv = leadsToCsv([
    { id: 1, name: 'Username Buyer', mobile: 'no-phone:IN.TEST001', waUsername: 'buyer_test', waUserId: 'IN.TEST001', createdAt },
    { id: 2, name: 'Email Buyer', mobile: 'no-phone:buyer@example.test', email: 'buyer@example.test', createdAt },
    { id: 3, name: 'Phone Buyer', mobile: '15550000001', createdAt },
  ]);
  const rows = parse(csv, { columns: true });
  assert.equal(rows[0].Mobile, '');
  assert.equal(rows[0]['WhatsApp Username'], 'buyer_test');
  assert.equal(rows[0]['WhatsApp User ID'], 'IN.TEST001');
  assert.equal(rows[1].Mobile, '');
  assert.equal(rows[1]['WhatsApp Username'], '');
  assert.equal(rows[2].Mobile, '15550000001');
  assert.ok(!csv.includes('no-phone:'));
});

test('CSV escapes identity fields and exports headers even with no leads', () => {
  const [row] = parse(leadsToCsv([{ id: 1, name: 'Test', waUsername: 'name,"test"', waUserId: 'TEST\nID', createdAt: new Date() }]), { columns: true });
  assert.equal(row['WhatsApp Username'], 'name,"test"');
  assert.equal(row['WhatsApp User ID'], 'TEST\nID');
  assert.ok(leadsToCsv([]).includes('WhatsApp User ID'));
});
