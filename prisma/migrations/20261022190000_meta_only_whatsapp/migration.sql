-- Preserve account IDs and conversations, but never activate a retired transport
-- merely because process-wide Meta credentials happen to exist.
UPDATE "WhatsAppAccount"
SET "enabled" = false, "status" = 'disconnected', "defaultCampaignName" = ''
WHERE "provider" <> 'meta';
UPDATE "WhatsAppAccount" SET "provider" = 'meta';

-- Provider campaign labels containing spaces or capitals are not Meta template names.
UPDATE "WhatsAppAccount" SET "defaultCampaignName" = ''
WHERE "defaultCampaignName" GLOB '*[^a-z0-9_]*';

ALTER TABLE "WhatsAppAccount" DROP COLUMN "aisensyProjectId";
ALTER TABLE "WhatsAppAccount" DROP COLUMN "aisensyApiKey";
ALTER TABLE "WhatsAppAccount" DROP COLUMN "aisensyCampaignApiKey";

-- Keep imported reconciliation snapshots in an inert archive. Remove active
-- sync settings rather than losing unmatched historical conversation data.
UPDATE "SystemConfig"
SET "key" = 'whatsapp.import_archive.' || substr("key", length('aisensy.dashboard_sync.') + 1)
WHERE "key" IN ('aisensy.dashboard_sync.snapshots', 'aisensy.dashboard_sync.unmatched');
DELETE FROM "SystemConfig" WHERE "key" LIKE 'aisensy.%';
