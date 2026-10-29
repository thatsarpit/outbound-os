CREATE TABLE "EmailVerification" (
  "email" TEXT NOT NULL PRIMARY KEY,
  "status" TEXT NOT NULL,
  "reason" TEXT NOT NULL,
  "result" TEXT NOT NULL,
  "checkedAt" DATETIME NOT NULL,
  "expiresAt" DATETIME NOT NULL
);
CREATE INDEX "EmailVerification_status_expiresAt_idx" ON "EmailVerification"("status", "expiresAt");
CREATE TABLE "EmailVerificationJob" (
  "id" TEXT NOT NULL PRIMARY KEY,
  "status" TEXT NOT NULL DEFAULT 'queued',
  "emails" TEXT NOT NULL,
  "total" INTEGER NOT NULL,
  "checked" INTEGER NOT NULL DEFAULT 0,
  "counts" TEXT NOT NULL DEFAULT '{}',
  "error" TEXT,
  "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "completedAt" DATETIME
);
CREATE INDEX "EmailVerificationJob_status_createdAt_idx" ON "EmailVerificationJob"("status", "createdAt");
CREATE TABLE "EmailVerificationJobResult" (
  "jobId" TEXT NOT NULL,
  "email" TEXT NOT NULL,
  "result" TEXT NOT NULL,
  "checkedAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  PRIMARY KEY ("jobId", "email")
);
