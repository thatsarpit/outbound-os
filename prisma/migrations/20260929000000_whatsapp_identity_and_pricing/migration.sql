-- WhatsApp business-scoped user ids and usernames on leads, so messages from
-- people Meta identifies without a phone number are not lost.
ALTER TABLE "Lead" ADD COLUMN "waUserId" TEXT;
ALTER TABLE "Lead" ADD COLUMN "waUsername" TEXT;
CREATE UNIQUE INDEX "Lead_waUserId_key" ON "Lead"("waUserId");

-- Meta's per-message pricing, recorded from status webhooks.
ALTER TABLE "Message" ADD COLUMN "pricingCategory" TEXT;
ALTER TABLE "Message" ADD COLUMN "pricingType" TEXT;
ALTER TABLE "Message" ADD COLUMN "billable" BOOLEAN;
CREATE INDEX "Message_pricingCategory_idx" ON "Message"("pricingCategory");
