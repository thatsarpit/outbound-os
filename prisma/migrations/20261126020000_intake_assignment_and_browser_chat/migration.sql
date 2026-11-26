ALTER TABLE "WebhookSource" ADD COLUMN "captureOnly" BOOLEAN NOT NULL DEFAULT false;
ALTER TABLE "WebhookSource" ADD COLUMN "defaultAssigneeKey" TEXT;

CREATE TABLE "BrowserChat" (
    "id" INTEGER NOT NULL PRIMARY KEY AUTOINCREMENT,
    "leadId" INTEGER NOT NULL,
    "tokenHash" TEXT NOT NULL,
    "createdBy" TEXT NOT NULL,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "expiresAt" DATETIME NOT NULL,
    "revokedAt" DATETIME,
    CONSTRAINT "BrowserChat_leadId_fkey" FOREIGN KEY ("leadId") REFERENCES "Lead" ("id") ON DELETE CASCADE ON UPDATE CASCADE
);
CREATE UNIQUE INDEX "BrowserChat_tokenHash_key" ON "BrowserChat"("tokenHash");
CREATE INDEX "BrowserChat_leadId_createdAt_idx" ON "BrowserChat"("leadId", "createdAt");
ALTER TABLE "Message" ADD COLUMN "browserChatId" INTEGER REFERENCES "BrowserChat"("id") ON DELETE SET NULL ON UPDATE CASCADE;
CREATE INDEX "Message_browserChatId_id_idx" ON "Message"("browserChatId", "id");
