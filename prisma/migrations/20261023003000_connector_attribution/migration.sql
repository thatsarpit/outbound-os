ALTER TABLE "Lead" ADD COLUMN "originSupplierId" INTEGER REFERENCES "Supplier"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
CREATE INDEX "Lead_originSupplierId_idx" ON "Lead"("originSupplierId");
ALTER TABLE "SalesOrder" ADD COLUMN "originSupplierId" INTEGER REFERENCES "Supplier"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "WebhookSource" ADD COLUMN "importSupplierId" INTEGER;
ALTER TABLE "WebhookSource" ADD COLUMN "importTags" TEXT NOT NULL DEFAULT '';
CREATE TABLE "ConnectorReceipt" (
  "id" INTEGER NOT NULL PRIMARY KEY AUTOINCREMENT,
  "sourceId" INTEGER NOT NULL REFERENCES "WebhookSource"("id") ON DELETE RESTRICT ON UPDATE CASCADE,
  "externalId" TEXT NOT NULL,
  "leadId" INTEGER REFERENCES "Lead"("id") ON DELETE SET NULL ON UPDATE CASCADE,
  "state" TEXT NOT NULL,
  "reason" TEXT,
  "recordJson" TEXT NOT NULL,
  "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP
);
CREATE UNIQUE INDEX "ConnectorReceipt_sourceId_externalId_key" ON "ConnectorReceipt"("sourceId", "externalId");
CREATE INDEX "ConnectorReceipt_leadId_idx" ON "ConnectorReceipt"("leadId");
CREATE INDEX "ConnectorReceipt_state_idx" ON "ConnectorReceipt"("state");
-- Keep earlier first-touch history recognised under provider-neutral labels.
UPDATE "Message" SET "templateVariant" = 'fresh-marketplace-multichannel-v2' WHERE "templateVariant" = 'fresh-indiamart-multichannel-v2';
UPDATE "Message" SET "templateVariant" = 'fresh-marketplace-multichannel-v1' WHERE "templateVariant" = 'fresh-indiamart-multichannel-v1';
