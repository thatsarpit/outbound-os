CREATE TABLE "BrowserChatAttachment" (
    "messageId" INTEGER NOT NULL PRIMARY KEY,
    "filename" TEXT NOT NULL,
    "contentType" TEXT NOT NULL,
    "size" INTEGER NOT NULL,
    "sha256" TEXT NOT NULL,
    "payload" BLOB,
    "expiresAt" DATETIME NOT NULL,
    CONSTRAINT "BrowserChatAttachment_messageId_fkey" FOREIGN KEY ("messageId") REFERENCES "Message" ("id") ON DELETE CASCADE ON UPDATE CASCADE
);
CREATE INDEX "BrowserChatAttachment_expiresAt_idx" ON "BrowserChatAttachment"("expiresAt");
