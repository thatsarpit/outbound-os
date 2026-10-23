ALTER TABLE "Lead" ADD COLUMN "inboxResolvedAt" DATETIME;

-- Preserve the previous inbox view for existing closed leads. Future sales
-- stage changes and inbox resolution are independent operations.
UPDATE "Lead" SET "inboxResolvedAt" = "updatedAt" WHERE "status" = 'closed';

CREATE TABLE "InboxReadState" (
    "id" INTEGER NOT NULL PRIMARY KEY AUTOINCREMENT,
    "leadId" INTEGER NOT NULL,
    "viewerKey" TEXT NOT NULL,
    "lastReadMessageId" INTEGER NOT NULL,
    "readAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "InboxReadState_leadId_fkey" FOREIGN KEY ("leadId") REFERENCES "Lead" ("id") ON DELETE CASCADE ON UPDATE CASCADE
);
CREATE UNIQUE INDEX "InboxReadState_leadId_viewerKey_key" ON "InboxReadState"("leadId", "viewerKey");
CREATE INDEX "InboxReadState_viewerKey_idx" ON "InboxReadState"("viewerKey");
