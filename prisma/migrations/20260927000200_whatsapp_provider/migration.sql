-- Each WhatsApp account now says who delivers its messages: Meta's Cloud API
-- directly, or AiSensy. New accounts default to Meta.
ALTER TABLE "WhatsAppAccount" ADD COLUMN "provider" TEXT NOT NULL DEFAULT 'meta';
ALTER TABLE "WhatsAppAccount" ADD COLUMN "templateLanguage" TEXT NOT NULL DEFAULT 'en';
ALTER TABLE "WhatsAppAccount" ADD COLUMN "metaWabaId" TEXT NOT NULL DEFAULT '';

-- Every account that existed before this migration was sending through
-- AiSensy, including ones that relied on the AISENSY_* env fallback and so
-- have no per-account credentials. Keep them on AiSensy unless they already
-- carry a complete set of direct Meta credentials.
UPDATE "WhatsAppAccount"
SET "provider" = 'aisensy'
WHERE "cloudApiPhoneId" = '' OR "cloudApiToken" = '';
