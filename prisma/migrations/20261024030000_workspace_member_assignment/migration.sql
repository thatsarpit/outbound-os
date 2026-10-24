CREATE TABLE "WorkspaceMember" (
  "key" TEXT NOT NULL PRIMARY KEY,
  "provider" TEXT NOT NULL,
  "externalId" TEXT NOT NULL,
  "orgId" TEXT NOT NULL,
  "name" TEXT NOT NULL,
  "email" TEXT,
  "role" TEXT NOT NULL,
  "lastVerifiedAt" DATETIME NOT NULL
);
CREATE UNIQUE INDEX "WorkspaceMember_provider_orgId_externalId_key" ON "WorkspaceMember"("provider", "orgId", "externalId");
ALTER TABLE "Lead" ADD COLUMN "assignedMemberKey" TEXT REFERENCES "WorkspaceMember"("key") ON DELETE SET NULL ON UPDATE CASCADE;
CREATE INDEX "Lead_assignedMemberKey_idx" ON "Lead"("assignedMemberKey");
