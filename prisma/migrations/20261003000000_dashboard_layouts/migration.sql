CREATE TABLE "DashboardPreference" (
  "id" INTEGER NOT NULL PRIMARY KEY AUTOINCREMENT,
  "ownerKey" TEXT NOT NULL,
  "page" TEXT NOT NULL,
  "layout" TEXT NOT NULL,
  "revision" INTEGER NOT NULL DEFAULT 1,
  "updatedAt" DATETIME NOT NULL
);
CREATE UNIQUE INDEX "DashboardPreference_ownerKey_page_key" ON "DashboardPreference"("ownerKey", "page");
