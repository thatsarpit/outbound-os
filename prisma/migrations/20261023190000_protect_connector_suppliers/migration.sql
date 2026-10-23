-- Keep configured source attribution attached to its supplier even before
-- the first import. Receipt/source IDs and all source settings are preserved.
PRAGMA defer_foreign_keys=ON;
PRAGMA foreign_keys=OFF;
CREATE TABLE "new_WebhookSource" (
  "tenantId" INTEGER,
  "id" INTEGER NOT NULL PRIMARY KEY AUTOINCREMENT,
  "name" TEXT NOT NULL,
  "source" TEXT NOT NULL,
  "apiKey" TEXT NOT NULL,
  "fieldMap" TEXT NOT NULL DEFAULT '{}',
  "poolId" INTEGER,
  "enabled" BOOLEAN NOT NULL DEFAULT true,
  "importSupplierId" INTEGER,
  "importTags" TEXT NOT NULL DEFAULT '',
  "lastReceivedAt" DATETIME,
  "totalReceived" INTEGER NOT NULL DEFAULT 0,
  "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "WebhookSource_importSupplierId_fkey" FOREIGN KEY ("importSupplierId") REFERENCES "Supplier" ("id") ON DELETE RESTRICT ON UPDATE CASCADE
);
-- A supplier already deleted by an older build cannot be restored here.
-- Clear only such dangling IDs so intake fails closed until reconfigured.
INSERT INTO "new_WebhookSource" ("tenantId","id","name","source","apiKey","fieldMap","poolId","enabled","importSupplierId","importTags","lastReceivedAt","totalReceived","createdAt")
SELECT "tenantId","id","name","source","apiKey","fieldMap","poolId","enabled",
  CASE WHEN EXISTS (SELECT 1 FROM "Supplier" WHERE "Supplier"."id"="WebhookSource"."importSupplierId") THEN "importSupplierId" ELSE NULL END,
  "importTags","lastReceivedAt","totalReceived","createdAt" FROM "WebhookSource";
DROP TABLE "WebhookSource";
ALTER TABLE "new_WebhookSource" RENAME TO "WebhookSource";
CREATE UNIQUE INDEX "WebhookSource_source_key" ON "WebhookSource"("source");
PRAGMA foreign_keys=ON;
PRAGMA defer_foreign_keys=OFF;
