CREATE TABLE "WebPushSubscription" (
  "id" INTEGER NOT NULL PRIMARY KEY AUTOINCREMENT,
  "viewerKey" TEXT NOT NULL,
  "userId" TEXT NOT NULL,
  "orgId" TEXT NOT NULL,
  "endpointHash" TEXT NOT NULL,
  "encryptedData" TEXT NOT NULL,
  "lastMessageId" INTEGER NOT NULL,
  "vapidKey" TEXT NOT NULL,
  "enabled" BOOLEAN NOT NULL DEFAULT true,
  "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" DATETIME NOT NULL
);
CREATE UNIQUE INDEX "WebPushSubscription_endpointHash_key" ON "WebPushSubscription"("endpointHash");
CREATE INDEX "WebPushSubscription_viewerKey_idx" ON "WebPushSubscription"("viewerKey");
