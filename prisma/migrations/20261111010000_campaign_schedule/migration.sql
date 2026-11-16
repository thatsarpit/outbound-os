ALTER TABLE "Campaign" ADD COLUMN "scheduleTimezone" TEXT;
ALTER TABLE "Campaign" ADD COLUMN "scheduleError" TEXT;
CREATE INDEX "Campaign_status_scheduledAt_idx" ON "Campaign"("status", "scheduledAt");
