CREATE TABLE "WhatsAppDispatch" (
    "id" INTEGER NOT NULL PRIMARY KEY AUTOINCREMENT,
    "accountId" INTEGER NOT NULL,
    "attemptedAt" DATETIME NOT NULL,
    CONSTRAINT "WhatsAppDispatch_accountId_fkey" FOREIGN KEY ("accountId") REFERENCES "WhatsAppAccount" ("id") ON DELETE CASCADE ON UPDATE CASCADE
);

CREATE INDEX "WhatsAppDispatch_accountId_attemptedAt_idx" ON "WhatsAppDispatch"("accountId", "attemptedAt");
CREATE INDEX "WhatsAppDispatch_attemptedAt_idx" ON "WhatsAppDispatch"("attemptedAt");

-- Carry forward recent sends and uncertain submissions with a known account.
INSERT INTO "WhatsAppDispatch" ("accountId", "attemptedAt")
SELECT message."waAccount", COALESCE(message."sentAt", message."createdAt")
FROM "Message" AS message
JOIN "WhatsAppAccount" AS account ON account."id" = message."waAccount"
WHERE message."direction" = 'outbound' AND message."channel" = 'whatsapp'
  AND (message."status" IN ('sent', 'delivered', 'read', 'unconfirmed', 'sending') OR message."waMessageId" IS NOT NULL)
  AND COALESCE(message."sentAt", message."createdAt") >= (CAST(strftime('%s', 'now') AS INTEGER) - 4 * 86400) * 1000;
