-- Meta's own messaging tier for each number, synced from the Graph API so
-- capacity checks can clamp the configured dailyLimit to the provider's real
-- ceiling instead of a static guess. Nullable: unknown until the first sync,
-- and never guessed.
ALTER TABLE "WhatsAppAccount" ADD COLUMN "metaMessagingTier" TEXT;
ALTER TABLE "WhatsAppAccount" ADD COLUMN "metaTierSyncedAt" DATETIME;
