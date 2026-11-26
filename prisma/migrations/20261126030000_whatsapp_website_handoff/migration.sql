ALTER TABLE "WebhookSource" ADD COLUMN "whatsappHandoffAccountId" INTEGER;
ALTER TABLE "WebhookSource" ADD COLUMN "websiteLeadLabel" TEXT;
ALTER TABLE "Lead" ADD COLUMN "websiteLeadLabel" TEXT;
ALTER TABLE "Lead" ADD COLUMN "websiteSourceName" TEXT;
ALTER TABLE "Message" ADD COLUMN "websiteHandoffKey" TEXT;
ALTER TABLE "Message" ADD COLUMN "websiteLeadLabel" TEXT;
ALTER TABLE "Message" ADD COLUMN "websiteSourceName" TEXT;
CREATE UNIQUE INDEX "Message_websiteHandoffKey_key" ON "Message"("websiteHandoffKey");
CREATE INDEX "Lead_websiteLeadLabel_idx" ON "Lead"("websiteLeadLabel");
