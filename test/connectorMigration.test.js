import { test } from 'node:test';
import assert from 'node:assert/strict';
import { DatabaseSync } from 'node:sqlite';
import fs from 'node:fs';

test('connector upgrade preserves contact history and earlier first-touch recognition', () => {
  const db = new DatabaseSync(':memory:');
  const target = '20261023003000_connector_attribution';
  const root = new URL('../prisma/migrations/', import.meta.url);
  try {
    for (const directory of fs.readdirSync(root).sort()) {
      if (directory >= target) continue;
      const file = new URL(`${directory}/migration.sql`, root);
      if (fs.existsSync(file)) db.exec(fs.readFileSync(file, 'utf8'));
    }
    db.exec(`INSERT INTO Lead (id,name,mobile,updatedAt,status,tags) VALUES (1,'Existing buyer','15550000001',0,'replied','existing-partner');
      INSERT INTO Message (id,leadId,direction,content,templateVariant,automationKey)
      VALUES (1,1,'outbound','Original message','fresh-indiamart-multichannel-v2','original-automation-key');`);
    db.exec(fs.readFileSync(new URL(`${target}/migration.sql`, root), 'utf8'));
    const lead = db.prepare('SELECT * FROM Lead WHERE id=1').get();
    const message = db.prepare('SELECT * FROM Message WHERE id=1').get();
    assert.equal(lead.status, 'replied'); assert.equal(lead.tags, 'existing-partner');
    assert.equal(lead.originSupplierId, null);
    assert.equal(message.content, 'Original message'); assert.equal(message.automationKey, 'original-automation-key');
    assert.equal(message.templateVariant, 'fresh-marketplace-multichannel-v2');
    assert.equal(db.prepare('SELECT count(*) AS n FROM ConnectorReceipt').get().n, 0);
    assert.deepEqual(db.prepare('PRAGMA foreign_key_check').all(), []);
  } finally { db.close(); }
});
