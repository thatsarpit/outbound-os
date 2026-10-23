import { test } from 'node:test';
import assert from 'node:assert/strict';
import { DatabaseSync } from 'node:sqlite';
import fs from 'node:fs';

test('supplier protection upgrade preserves source/receipt identity and rejects dangling configuration', () => {
  const db = new DatabaseSync(':memory:');
  const root = new URL('../prisma/migrations/', import.meta.url);
  const target = '20261023190000_protect_connector_suppliers';
  try {
    for (const directory of fs.readdirSync(root).sort()) {
      if (directory >= target) continue;
      const file = new URL(`${directory}/migration.sql`, root);
      if (fs.existsSync(file)) db.exec(fs.readFileSync(file, 'utf8'));
    }
    db.exec(`INSERT INTO Supplier (id,name,updatedAt) VALUES (1,'Fixture partner',0);
      INSERT INTO WebhookSource (id,name,source,apiKey,importSupplierId,importTags,totalReceived)
      VALUES (1,'Fixture source','fixture','fixture-key',1,'retained-tag',7),(2,'Stale source','stale','fixture-key',999,'retained-tag',0);
      INSERT INTO ConnectorReceipt (id,sourceId,externalId,state,recordJson) VALUES (1,1,'fixture-original','conflict','{}');`);
    db.exec(fs.readFileSync(new URL(`${target}/migration.sql`, root), 'utf8'));
    const source = db.prepare('SELECT * FROM WebhookSource WHERE id=1').get();
    assert.equal(source.importSupplierId, 1); assert.equal(source.apiKey, 'fixture-key');
    assert.equal(source.importTags, 'retained-tag'); assert.equal(source.totalReceived, 7);
    assert.equal(db.prepare('SELECT sourceId FROM ConnectorReceipt WHERE id=1').get().sourceId, 1);
    assert.equal(db.prepare('SELECT importSupplierId FROM WebhookSource WHERE id=2').get().importSupplierId, null);
    assert.throws(() => db.exec('DELETE FROM Supplier WHERE id=1'), /FOREIGN KEY/);
    assert.throws(() => db.exec('UPDATE WebhookSource SET importSupplierId=999 WHERE id=1'), /FOREIGN KEY/);
    assert.deepEqual(db.prepare('PRAGMA foreign_key_check').all(), []);
  } finally { db.close(); }
});
