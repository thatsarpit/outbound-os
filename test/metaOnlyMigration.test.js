import { test } from 'node:test';
import assert from 'node:assert/strict';
import { DatabaseSync } from 'node:sqlite';
import fs from 'node:fs';
import path from 'node:path';

// Exercise the real upgrade, including the retired columns, without copying
// production data or rewriting already-applied migration history.
test('Meta-only upgrade preserves messages and removes retired credentials', () => {
  const db = new DatabaseSync(':memory:');
  try {
    const root = new URL('../prisma/migrations/', import.meta.url);
    const target = '20261022190000_meta_only_whatsapp';
    for (const directory of fs.readdirSync(root).sort()) {
      if (directory >= target) continue;
      const file = new URL(`${directory}/migration.sql`, root);
      if (fs.existsSync(file)) db.exec(fs.readFileSync(file, 'utf8'));
    }
    db.prepare(`INSERT INTO WhatsAppAccount (id,name,provider,enabled,status,cloudApiPhoneId,cloudApiToken,defaultCampaignName,aisensyApiKey)
      VALUES (1,'Direct account','meta',1,'connected','phone','encrypted-token','approved_template','obsolete-key'),
             (2,'Retired account','retired-provider',1,'connected','','','Old Campaign','obsolete-key'),
             (3,'Migrated default','meta',1,'connected','phone-3','encrypted-token-3','Live Leads','')`).run();
    db.prepare(`INSERT INTO Lead (id,name,mobile,updatedAt) VALUES (1,'Historical customer','15550000001',0)`).run();
    db.prepare(`INSERT INTO Message (id,leadId,direction,content,waAccount,waMessageId) VALUES (1,1,'inbound','Historical reply',2,'original-provider-id')`).run();
    db.prepare(`INSERT INTO SystemConfig (key,value) VALUES ('aisensy.dashboard_sync.unmatched','retained import'),('aisensy.dashboard_sync.enabled','true')`).run();
    db.exec(fs.readFileSync(new URL(`${target}/migration.sql`, root), 'utf8'));
    const columns = db.prepare('PRAGMA table_info(WhatsAppAccount)').all().map((c) => c.name);
    assert.ok(columns.every((name) => !name.toLowerCase().startsWith('aisensy')));
    const direct = db.prepare('SELECT * FROM WhatsAppAccount WHERE id=1').get();
    assert.equal(direct.enabled, 1);
    assert.equal(direct.cloudApiToken, 'encrypted-token');
    assert.equal(direct.defaultCampaignName, 'approved_template');
    const retired = db.prepare('SELECT * FROM WhatsAppAccount WHERE id=2').get();
    assert.equal(retired.enabled, 0);
    assert.equal(retired.status, 'disconnected');
    assert.equal(retired.provider, 'meta');
    assert.equal(db.prepare('SELECT defaultCampaignName FROM WhatsAppAccount WHERE id=3').get().defaultCampaignName, '');
    const message = db.prepare('SELECT * FROM Message WHERE id=1').get();
    assert.equal(message.content, 'Historical reply');
    assert.equal(message.waMessageId, 'original-provider-id');
    assert.equal(message.waAccount, 2);
    assert.equal(db.prepare("SELECT value FROM SystemConfig WHERE key='whatsapp.import_archive.unmatched'").get().value, 'retained import');
    assert.equal(db.prepare("SELECT count(*) AS n FROM SystemConfig WHERE key LIKE 'aisensy.%'").get().n, 0);
  } finally {
    db.close();
  }
});
