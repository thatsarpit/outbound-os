ALTER TABLE "EmailAccount" ADD COLUMN "lastReceivingError" TEXT;

UPDATE "EmailAccount"
SET "lastReceivingError" = "lastError", "lastError" = NULL
WHERE "lastError" LIKE 'IMAP: %'
   OR "lastError" LIKE 'Inbox sync failed.%'
   OR "lastError" LIKE 'Saved password can no longer be decrypted%';
