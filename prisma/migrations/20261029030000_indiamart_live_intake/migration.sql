ALTER TABLE "ConnectorReceipt" ADD COLUMN "liveState" TEXT NOT NULL DEFAULT 'none';
ALTER TABLE "ConnectorReceipt" ADD COLUMN "liveLeadVersion" DATETIME;
ALTER TABLE "ConnectorReceipt" ADD COLUMN "liveError" TEXT;
