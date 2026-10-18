ALTER TABLE "Message" ADD COLUMN "emailRecipient" TEXT;
ALTER TABLE "Message" ADD COLUMN "providerDeliveryStatus" TEXT;
ALTER TABLE "Message" ADD COLUMN "providerDeliveryAt" DATETIME;
CREATE INDEX "Message_providerMessageId_idx" ON "Message"("providerMessageId");
CREATE INDEX "Message_emailMessageId_idx" ON "Message"("emailMessageId");

CREATE TABLE "EmailDeliveryEvent" (
  "id" INTEGER NOT NULL PRIMARY KEY AUTOINCREMENT,
  "eventKey" TEXT NOT NULL,
  "provider" TEXT NOT NULL DEFAULT 'brevo',
  "event" TEXT NOT NULL,
  "recipient" TEXT NOT NULL,
  "providerCampaignId" TEXT,
  "providerMessageId" TEXT,
  "emailAccountId" INTEGER,
  "accountScope" TEXT,
  "messageId" INTEGER,
  "occurredAt" DATETIME,
  "receivedAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "lastAttemptAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "outcome" TEXT NOT NULL,
  "reason" TEXT,
  CONSTRAINT "EmailDeliveryEvent_messageId_fkey" FOREIGN KEY ("messageId") REFERENCES "Message"("id") ON DELETE CASCADE ON UPDATE CASCADE
);
CREATE UNIQUE INDEX "EmailDeliveryEvent_eventKey_key" ON "EmailDeliveryEvent"("eventKey");
CREATE INDEX "EmailDeliveryEvent_messageId_idx" ON "EmailDeliveryEvent"("messageId");
CREATE INDEX "EmailDeliveryEvent_outcome_lastAttemptAt_idx" ON "EmailDeliveryEvent"("outcome", "lastAttemptAt");
