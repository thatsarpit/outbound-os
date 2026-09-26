-- Outbound OS no longer polls IndiaMART directly. Leads from IndiaMART (or any
-- other marketplace) now arrive through an inbound webhook like every other
-- source, so the seller-account and Lead Manager chat tables go away.
--
-- Lead.indiamartId becomes Lead.externalId: the same value, now meaning "this
-- lead's id in whatever system sent it". The INSERT below copies it across
-- explicitly; a generated diff would have dropped it.
--
-- Messages that were sent or received over the old IndiaMART chat keep their
-- content and channel; only the links to the deleted tables are removed.

-- DropIndex
DROP INDEX "IndiaMartAccount_enabled_idx";

-- DropIndex
DROP INDEX "IndiaMartAccount_targetPoolId_idx";

-- DropIndex
DROP INDEX "IndiaMartConversation_indiaMartAccountId_lastMessageAt_idx";

-- DropIndex
DROP INDEX "IndiaMartConversation_leadId_idx";

-- DropIndex
DROP INDEX "IndiaMartConversation_buyerGlid_idx";

-- DropIndex
DROP INDEX "IndiaMartConversation_status_idx";

-- DropIndex
DROP INDEX "IndiaMartConversation_indiaMartAccountId_remoteConversationId_key";

-- DropTable
PRAGMA foreign_keys=off;
DROP TABLE "IndiaMartAccount";
PRAGMA foreign_keys=on;

-- DropTable
PRAGMA foreign_keys=off;
DROP TABLE "IndiaMartConversation";
PRAGMA foreign_keys=on;

-- RedefineTables
PRAGMA defer_foreign_keys=ON;
PRAGMA foreign_keys=OFF;
CREATE TABLE "new_Lead" (
    "tenantId" INTEGER,
    "id" INTEGER NOT NULL PRIMARY KEY AUTOINCREMENT,
    "externalId" TEXT,
    "name" TEXT NOT NULL,
    "company" TEXT,
    "mobile" TEXT NOT NULL,
    "email" TEXT,
    "country" TEXT,
    "product" TEXT,
    "quantity" TEXT,
    "strength" TEXT,
    "brand" TEXT,
    "source" TEXT NOT NULL DEFAULT 'manual',
    "importBatchId" INTEGER,
    "status" TEXT NOT NULL DEFAULT 'new',
    "assignedToId" INTEGER,
    "isOnWhatsApp" BOOLEAN,
    "assignedAccount" INTEGER NOT NULL DEFAULT 0,
    "emailStatus" TEXT NOT NULL DEFAULT 'none',
    "emailOptOut" BOOLEAN NOT NULL DEFAULT false,
    "emailOptOutAt" DATETIME,
    "emailMarketingConsent" BOOLEAN NOT NULL DEFAULT false,
    "emailMarketingConsentAt" DATETIME,
    "emailMarketingConsentSource" TEXT,
    "assignedEmailAccountId" INTEGER,
    "imessageStatus" TEXT NOT NULL DEFAULT 'none',
    "assignedIMessageAccountId" INTEGER,
    "imessageFollowupCount" INTEGER NOT NULL DEFAULT 0,
    "lastImessageAt" DATETIME,
    "telegramPeer" TEXT,
    "telegramStatus" TEXT NOT NULL DEFAULT 'none',
    "assignedTelegramAccountId" INTEGER,
    "followupCount" INTEGER NOT NULL DEFAULT 0,
    "emailFollowupCount" INTEGER NOT NULL DEFAULT 0,
    "maxFollowups" INTEGER NOT NULL DEFAULT 5,
    "lastMessageAt" DATETIME,
    "lastEmailAt" DATETIME,
    "repliedAt" DATETIME,
    "score" INTEGER NOT NULL DEFAULT 0,
    "replySpeed" TEXT,
    "engagementLevel" TEXT NOT NULL DEFAULT 'none',
    "consumedAt" DATETIME,
    "leadTier" TEXT,
    "leadTierUpdatedAt" DATETIME,
    "notes" TEXT,
    "tags" TEXT,
    "lastError" TEXT,
    "lastErrorAt" DATETIME,
    "lastReplyIntent" TEXT,
    "aiInsights" TEXT,
    "enrichedData" TEXT,
    "dealValue" REAL,
    "convertedAt" DATETIME,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" DATETIME NOT NULL,
    "poolId" INTEGER,
    CONSTRAINT "Lead_assignedToId_fkey" FOREIGN KEY ("assignedToId") REFERENCES "User" ("id") ON DELETE SET NULL ON UPDATE CASCADE,
    CONSTRAINT "Lead_assignedIMessageAccountId_fkey" FOREIGN KEY ("assignedIMessageAccountId") REFERENCES "IMessageAccount" ("id") ON DELETE SET NULL ON UPDATE CASCADE,
    CONSTRAINT "Lead_assignedTelegramAccountId_fkey" FOREIGN KEY ("assignedTelegramAccountId") REFERENCES "TelegramAccount" ("id") ON DELETE SET NULL ON UPDATE CASCADE,
    CONSTRAINT "Lead_poolId_fkey" FOREIGN KEY ("poolId") REFERENCES "LeadPool" ("id") ON DELETE SET NULL ON UPDATE CASCADE
);
INSERT INTO "new_Lead" ("externalId", "aiInsights", "assignedAccount", "assignedEmailAccountId", "assignedIMessageAccountId", "assignedTelegramAccountId", "assignedToId", "brand", "company", "consumedAt", "convertedAt", "country", "createdAt", "dealValue", "email", "emailFollowupCount", "emailMarketingConsent", "emailMarketingConsentAt", "emailMarketingConsentSource", "emailOptOut", "emailOptOutAt", "emailStatus", "engagementLevel", "enrichedData", "followupCount", "id", "imessageFollowupCount", "imessageStatus", "importBatchId", "isOnWhatsApp", "lastEmailAt", "lastError", "lastErrorAt", "lastImessageAt", "lastMessageAt", "lastReplyIntent", "leadTier", "leadTierUpdatedAt", "maxFollowups", "mobile", "name", "notes", "poolId", "product", "quantity", "repliedAt", "replySpeed", "score", "source", "status", "strength", "tags", "telegramPeer", "telegramStatus", "tenantId", "updatedAt") SELECT "indiamartId", "aiInsights", "assignedAccount", "assignedEmailAccountId", "assignedIMessageAccountId", "assignedTelegramAccountId", "assignedToId", "brand", "company", "consumedAt", "convertedAt", "country", "createdAt", "dealValue", "email", "emailFollowupCount", "emailMarketingConsent", "emailMarketingConsentAt", "emailMarketingConsentSource", "emailOptOut", "emailOptOutAt", "emailStatus", "engagementLevel", "enrichedData", "followupCount", "id", "imessageFollowupCount", "imessageStatus", "importBatchId", "isOnWhatsApp", "lastEmailAt", "lastError", "lastErrorAt", "lastImessageAt", "lastMessageAt", "lastReplyIntent", "leadTier", "leadTierUpdatedAt", "maxFollowups", "mobile", "name", "notes", "poolId", "product", "quantity", "repliedAt", "replySpeed", "score", "source", "status", "strength", "tags", "telegramPeer", "telegramStatus", "tenantId", "updatedAt" FROM "Lead";
DROP TABLE "Lead";
ALTER TABLE "new_Lead" RENAME TO "Lead";
CREATE INDEX "Lead_status_idx" ON "Lead"("status");
CREATE INDEX "Lead_leadTier_idx" ON "Lead"("leadTier");
CREATE INDEX "Lead_score_idx" ON "Lead"("score");
CREATE INDEX "Lead_createdAt_idx" ON "Lead"("createdAt");
CREATE INDEX "Lead_convertedAt_idx" ON "Lead"("convertedAt");
CREATE INDEX "Lead_source_idx" ON "Lead"("source");
CREATE INDEX "Lead_assignedAccount_idx" ON "Lead"("assignedAccount");
CREATE INDEX "Lead_assignedToId_idx" ON "Lead"("assignedToId");
CREATE INDEX "Lead_poolId_idx" ON "Lead"("poolId");
CREATE INDEX "Lead_assignedTelegramAccountId_idx" ON "Lead"("assignedTelegramAccountId");
CREATE UNIQUE INDEX "Lead_tenantId_externalId_key" ON "Lead"("tenantId", "externalId");
CREATE UNIQUE INDEX "Lead_tenantId_mobile_key" ON "Lead"("tenantId", "mobile");
CREATE TABLE "new_Message" (
    "tenantId" INTEGER,
    "id" INTEGER NOT NULL PRIMARY KEY AUTOINCREMENT,
    "leadId" INTEGER NOT NULL,
    "direction" TEXT NOT NULL,
    "channel" TEXT NOT NULL DEFAULT 'whatsapp',
    "content" TEXT NOT NULL,
    "waAccount" INTEGER NOT NULL DEFAULT 0,
    "emailAccountId" INTEGER,
    "imessageAccountId" INTEGER,
    "telegramAccountId" INTEGER,
    "status" TEXT NOT NULL DEFAULT 'queued',
    "retryCount" INTEGER NOT NULL DEFAULT 0,
    "maxRetries" INTEGER NOT NULL DEFAULT 3,
    "campaignId" INTEGER,
    "scheduledAt" DATETIME,
    "sentAt" DATETIME,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "waMessageId" TEXT,
    "ackStatus" INTEGER NOT NULL DEFAULT 0,
    "ackUpdatedAt" DATETIME,
    "waCampaignName" TEXT,
    "waTemplateParams" TEXT,
    "emailSubject" TEXT,
    "emailHtmlBody" TEXT,
    "emailMessageId" TEXT,
    "emailInReplyTo" TEXT,
    "imessageMessageId" TEXT,
    "telegramMessageId" TEXT,
    "providerMessageId" TEXT,
    "providerCampaignId" TEXT,
    "providerCreatedAt" DATETIME,
    "providerStatusReason" TEXT,
    "idempotencyKey" TEXT,
    "automationKey" TEXT,
    "emailCc" TEXT,
    "emailBcc" TEXT,
    "templateVariant" TEXT,
    "mediaUrl" TEXT,
    "mediaType" TEXT,
    "mediaCaption" TEXT,
    "mediaFilename" TEXT,
    CONSTRAINT "Message_leadId_fkey" FOREIGN KEY ("leadId") REFERENCES "Lead" ("id") ON DELETE CASCADE ON UPDATE CASCADE,
    CONSTRAINT "Message_imessageAccountId_fkey" FOREIGN KEY ("imessageAccountId") REFERENCES "IMessageAccount" ("id") ON DELETE SET NULL ON UPDATE CASCADE,
    CONSTRAINT "Message_telegramAccountId_fkey" FOREIGN KEY ("telegramAccountId") REFERENCES "TelegramAccount" ("id") ON DELETE SET NULL ON UPDATE CASCADE
);
INSERT INTO "new_Message" ("ackStatus", "ackUpdatedAt", "automationKey", "campaignId", "channel", "content", "createdAt", "direction", "emailAccountId", "emailBcc", "emailCc", "emailHtmlBody", "emailInReplyTo", "emailMessageId", "emailSubject", "id", "idempotencyKey", "imessageAccountId", "imessageMessageId", "leadId", "maxRetries", "mediaCaption", "mediaFilename", "mediaType", "mediaUrl", "providerCampaignId", "providerCreatedAt", "providerMessageId", "providerStatusReason", "retryCount", "scheduledAt", "sentAt", "status", "telegramAccountId", "telegramMessageId", "templateVariant", "tenantId", "updatedAt", "waAccount", "waCampaignName", "waMessageId", "waTemplateParams") SELECT "ackStatus", "ackUpdatedAt", "automationKey", "campaignId", "channel", "content", "createdAt", "direction", "emailAccountId", "emailBcc", "emailCc", "emailHtmlBody", "emailInReplyTo", "emailMessageId", "emailSubject", "id", "idempotencyKey", "imessageAccountId", "imessageMessageId", "leadId", "maxRetries", "mediaCaption", "mediaFilename", "mediaType", "mediaUrl", "providerCampaignId", "providerCreatedAt", "providerMessageId", "providerStatusReason", "retryCount", "scheduledAt", "sentAt", "status", "telegramAccountId", "telegramMessageId", "templateVariant", "tenantId", "updatedAt", "waAccount", "waCampaignName", "waMessageId", "waTemplateParams" FROM "Message";
DROP TABLE "Message";
ALTER TABLE "new_Message" RENAME TO "Message";
CREATE INDEX "Message_leadId_idx" ON "Message"("leadId");
CREATE INDEX "Message_status_idx" ON "Message"("status");
CREATE INDEX "Message_scheduledAt_idx" ON "Message"("scheduledAt");
CREATE INDEX "Message_channel_idx" ON "Message"("channel");
CREATE INDEX "Message_imessageAccountId_idx" ON "Message"("imessageAccountId");
CREATE INDEX "Message_telegramAccountId_idx" ON "Message"("telegramAccountId");
CREATE INDEX "Message_templateVariant_idx" ON "Message"("templateVariant");
CREATE INDEX "Message_waMessageId_idx" ON "Message"("waMessageId");
CREATE INDEX "Message_providerCampaignId_idx" ON "Message"("providerCampaignId");
CREATE INDEX "Message_ackStatus_idx" ON "Message"("ackStatus");
CREATE UNIQUE INDEX "Message_tenantId_imessageMessageId_key" ON "Message"("tenantId", "imessageMessageId");
CREATE UNIQUE INDEX "Message_telegramAccountId_telegramMessageId_key" ON "Message"("telegramAccountId", "telegramMessageId");
CREATE UNIQUE INDEX "Message_tenantId_automationKey_key" ON "Message"("tenantId", "automationKey");
PRAGMA foreign_keys=ON;
PRAGMA defer_foreign_keys=OFF;

