ALTER TABLE "WhatsAppAccount" ADD COLUMN "ycloudApiKey" TEXT NOT NULL DEFAULT '';
ALTER TABLE "WhatsAppAccount" ADD COLUMN "ycloudWebhookSecret" TEXT NOT NULL DEFAULT '';
ALTER TABLE "WhatsAppAccount" ADD COLUMN "ycloudPhoneNumber" TEXT NOT NULL DEFAULT '';
ALTER TABLE "WhatsAppAccount" ADD COLUMN "ycloudWabaId" TEXT NOT NULL DEFAULT '';
