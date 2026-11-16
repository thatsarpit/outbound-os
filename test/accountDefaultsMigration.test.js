import { test } from 'node:test';
import assert from 'node:assert/strict';
import { DatabaseSync } from 'node:sqlite';
import fs from 'node:fs';

test('neutral account defaults preserve existing accounts and their references', () => {
  const db = new DatabaseSync(':memory:');
  const root = new URL('../prisma/migrations/', import.meta.url);
  const target = '20261116010000_neutral_account_defaults';
  try {
    for (const directory of fs.readdirSync(root).sort()) {
      if (directory >= target) continue;
      const file = new URL(`${directory}/migration.sql`, root);
      if (fs.existsSync(file)) db.exec(fs.readFileSync(file, 'utf8'));
    }
    db.exec(`INSERT INTO WhatsAppAccount (id,name,companyName,personaName,ycloudApiKey)
      VALUES (7,'Fixture account','Fixture company','Fixture sender','fixture-only');
      INSERT INTO LeadPool (id,name,slug,updatedAt) VALUES (7,'Fixture pool','fixture',0);
      INSERT INTO LeadPoolWhatsApp (poolId,whatsappAccountId) VALUES (7,7);`);
    const original = { ...db.prepare('SELECT * FROM WhatsAppAccount WHERE id=7').get() };
    db.exec(fs.readFileSync(new URL(`${target}/migration.sql`, root), 'utf8'));
    assert.deepEqual({ ...db.prepare('SELECT * FROM WhatsAppAccount WHERE id=7').get() }, original);
    assert.equal(db.prepare('SELECT whatsappAccountId FROM LeadPoolWhatsApp WHERE poolId=7').get().whatsappAccountId, 7);
    db.exec("INSERT INTO WhatsAppAccount (name) VALUES ('Fresh fixture')");
    const fresh = db.prepare("SELECT * FROM WhatsAppAccount WHERE name='Fresh fixture'").get();
    assert.ok(fresh.id > 7);
    for (const field of ['personaName', 'personaGender', 'companyName', 'companyCity', 'companyIndustry', 'companyCerts', 'companyUSP']) {
      assert.equal(fresh[field], '');
    }
    assert.deepEqual(db.prepare('PRAGMA foreign_key_check').all(), []);
  } finally { db.close(); }
});
