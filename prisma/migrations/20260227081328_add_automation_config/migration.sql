-- RedefineTables
PRAGMA defer_foreign_keys=ON;
PRAGMA foreign_keys=OFF;
CREATE TABLE "new_AppConfig" (
    "id" TEXT NOT NULL PRIMARY KEY DEFAULT 'singleton',
    "passwordHash" TEXT NOT NULL,
    "sessionSecret" TEXT NOT NULL,
    "autoFeeEnabled" BOOLEAN NOT NULL DEFAULT false,
    "autoRebalanceEnabled" BOOLEAN NOT NULL DEFAULT false,
    "autoPeerEnabled" BOOLEAN NOT NULL DEFAULT false,
    "automationInterval" INTEGER NOT NULL DEFAULT 60,
    "lastAutomationRun" DATETIME,
    "updatedAt" DATETIME NOT NULL
);
INSERT INTO "new_AppConfig" ("id", "passwordHash", "sessionSecret", "updatedAt") SELECT "id", "passwordHash", "sessionSecret", "updatedAt" FROM "AppConfig";
DROP TABLE "AppConfig";
ALTER TABLE "new_AppConfig" RENAME TO "AppConfig";
PRAGMA foreign_keys=ON;
PRAGMA defer_foreign_keys=OFF;
