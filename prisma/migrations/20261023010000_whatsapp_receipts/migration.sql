CREATE TABLE "WhatsAppReceipt" (
  "id" INTEGER NOT NULL PRIMARY KEY AUTOINCREMENT,
  "eventKey" TEXT NOT NULL,
  "accountId" INTEGER NOT NULL,
  "waMessageId" TEXT NOT NULL,
  "status" TEXT NOT NULL,
  "failureCode" INTEGER,
  "failureReason" TEXT,
  "pricing" TEXT,
  "receivedAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "lastCheckedAt" DATETIME,
  "appliedAt" DATETIME
);
CREATE UNIQUE INDEX "WhatsAppReceipt_eventKey_key" ON "WhatsAppReceipt"("eventKey");
CREATE INDEX "WhatsAppReceipt_waMessageId_accountId_idx" ON "WhatsAppReceipt"("waMessageId", "accountId");
CREATE INDEX "WhatsAppReceipt_appliedAt_idx" ON "WhatsAppReceipt"("appliedAt");

ALTER TABLE "Message" ADD COLUMN "manualSendKey" TEXT;
CREATE UNIQUE INDEX "Message_manualSendKey_key" ON "Message"("manualSendKey");
