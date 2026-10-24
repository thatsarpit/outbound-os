CREATE TABLE "InboundEmailReceipt" (
  "id" INTEGER NOT NULL PRIMARY KEY AUTOINCREMENT,
  "provider" TEXT NOT NULL,
  "dedupeKey" TEXT NOT NULL,
  "payloadHash" TEXT NOT NULL,
  "envelopeFrom" TEXT NOT NULL,
  "envelopeTo" TEXT NOT NULL,
  "emailAccountId" INTEGER,
  "messageId" INTEGER,
  "rfcMessageId" TEXT,
  "state" TEXT NOT NULL DEFAULT 'pending',
  "reason" TEXT,
  "rawPath" TEXT,
  "attachmentMetadata" TEXT,
  "receivedAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "processedAt" DATETIME
);
CREATE UNIQUE INDEX "InboundEmailReceipt_dedupeKey_key" ON "InboundEmailReceipt"("dedupeKey");
CREATE INDEX "InboundEmailReceipt_state_receivedAt_idx" ON "InboundEmailReceipt"("state", "receivedAt");
CREATE INDEX "InboundEmailReceipt_emailAccountId_idx" ON "InboundEmailReceipt"("emailAccountId");
