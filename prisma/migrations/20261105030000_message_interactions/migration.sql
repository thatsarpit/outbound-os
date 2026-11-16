ALTER TABLE "Message" ADD COLUMN "quotedMessageId" INTEGER;
ALTER TABLE "Message" ADD COLUMN "quotedRemoteId" TEXT;
CREATE TABLE "MessageReaction" (
  "id" INTEGER NOT NULL PRIMARY KEY AUTOINCREMENT,
  "channel" TEXT NOT NULL,
  "accountId" INTEGER NOT NULL,
  "targetId" TEXT NOT NULL,
  "actorKey" TEXT NOT NULL,
  "emoji" TEXT NOT NULL,
  "eventAt" DATETIME NOT NULL
);
CREATE UNIQUE INDEX "MessageReaction_channel_accountId_targetId_actorKey_key" ON "MessageReaction"("channel", "accountId", "targetId", "actorKey");

ALTER TABLE "WhatsAppReceipt" ADD COLUMN "nativeMessageId" TEXT;
