ALTER TABLE "Campaign" ADD COLUMN "emailSenderAccountId" INTEGER;
ALTER TABLE "Campaign" ADD COLUMN "whatsappSenderAccountId" INTEGER;
ALTER TABLE "CampaignLead" ADD COLUMN "skipReason" TEXT;

CREATE TABLE "NotificationCursor" (
  "viewerKey" TEXT NOT NULL PRIMARY KEY,
  "readThroughId" INTEGER NOT NULL DEFAULT 0,
  "updatedAt" DATETIME NOT NULL
);
CREATE TABLE "NotificationRead" (
  "viewerKey" TEXT NOT NULL,
  "activityId" INTEGER NOT NULL,
  "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  PRIMARY KEY ("viewerKey", "activityId")
);
CREATE TABLE "McpAuthorizationStore" (
  "id" TEXT NOT NULL PRIMARY KEY,
  "revision" INTEGER NOT NULL DEFAULT 0,
  "value" TEXT NOT NULL,
  "updatedAt" DATETIME NOT NULL
);
