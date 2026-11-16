-- Normalize legacy installation defaults while preserving every configured account value.
-- RedefineTables
PRAGMA defer_foreign_keys=ON;
PRAGMA foreign_keys=OFF;
CREATE TABLE "new_WhatsAppAccount" (
    "tenantId" INTEGER,
    "id" INTEGER NOT NULL PRIMARY KEY AUTOINCREMENT,
    "name" TEXT NOT NULL,
    "phone" TEXT NOT NULL DEFAULT '',
    "status" TEXT NOT NULL DEFAULT 'disconnected',
    "role" TEXT NOT NULL DEFAULT 'outreach',
    "waAccountType" TEXT NOT NULL DEFAULT 'cloud_api',
    "provider" TEXT NOT NULL DEFAULT 'meta',
    "templateLanguage" TEXT NOT NULL DEFAULT 'en',
    "metaWabaId" TEXT NOT NULL DEFAULT '',
    "defaultCampaignName" TEXT NOT NULL DEFAULT '',
    "cloudApiToken" TEXT NOT NULL DEFAULT '',
    "cloudApiPhoneId" TEXT NOT NULL DEFAULT '',
    "ycloudApiKey" TEXT NOT NULL DEFAULT '',
    "ycloudWebhookSecret" TEXT NOT NULL DEFAULT '',
    "ycloudPhoneNumber" TEXT NOT NULL DEFAULT '',
    "ycloudWabaId" TEXT NOT NULL DEFAULT '',
    "enabled" BOOLEAN NOT NULL DEFAULT false,
    "autoSleep" BOOLEAN NOT NULL DEFAULT true,
    "personaName" TEXT NOT NULL DEFAULT '',
    "personaGender" TEXT NOT NULL DEFAULT '',
    "personaTitle" TEXT NOT NULL DEFAULT 'sales representative',
    "companyName" TEXT NOT NULL DEFAULT '',
    "companyCity" TEXT NOT NULL DEFAULT '',
    "companyIndustry" TEXT NOT NULL DEFAULT '',
    "companyCerts" TEXT NOT NULL DEFAULT '',
    "companyUSP" TEXT NOT NULL DEFAULT '',
    "hourlyLimit" INTEGER NOT NULL DEFAULT 2,
    "dailyLimit" INTEGER NOT NULL DEFAULT 20,
    "newLeadsPerDay" INTEGER NOT NULL DEFAULT 5,
    "maxFollowups" INTEGER NOT NULL DEFAULT 5,
    "followupDelays" TEXT NOT NULL DEFAULT '[0,240,1440,2880,4320]',
    "messagesSentToday" INTEGER NOT NULL DEFAULT 0,
    "newLeadsContactedToday" INTEGER NOT NULL DEFAULT 0,
    "lastResetAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP
);
INSERT INTO "new_WhatsAppAccount" ("autoSleep", "cloudApiPhoneId", "cloudApiToken", "companyCerts", "companyCity", "companyIndustry", "companyName", "companyUSP", "createdAt", "dailyLimit", "defaultCampaignName", "enabled", "followupDelays", "hourlyLimit", "id", "lastResetAt", "maxFollowups", "messagesSentToday", "metaWabaId", "name", "newLeadsContactedToday", "newLeadsPerDay", "personaGender", "personaName", "personaTitle", "phone", "provider", "role", "status", "templateLanguage", "tenantId", "waAccountType", "ycloudApiKey", "ycloudPhoneNumber", "ycloudWabaId", "ycloudWebhookSecret") SELECT "autoSleep", "cloudApiPhoneId", "cloudApiToken", "companyCerts", "companyCity", "companyIndustry", "companyName", "companyUSP", "createdAt", "dailyLimit", "defaultCampaignName", "enabled", "followupDelays", "hourlyLimit", "id", "lastResetAt", "maxFollowups", "messagesSentToday", "metaWabaId", "name", "newLeadsContactedToday", "newLeadsPerDay", "personaGender", "personaName", "personaTitle", "phone", "provider", "role", "status", "templateLanguage", "tenantId", "waAccountType", "ycloudApiKey", "ycloudPhoneNumber", "ycloudWabaId", "ycloudWebhookSecret" FROM "WhatsAppAccount";
DROP TABLE "WhatsAppAccount";
ALTER TABLE "new_WhatsAppAccount" RENAME TO "WhatsAppAccount";
PRAGMA foreign_keys=ON;
PRAGMA defer_foreign_keys=OFF;

