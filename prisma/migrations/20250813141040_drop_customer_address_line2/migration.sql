/*
  Warnings:

  - You are about to drop the column `addressLine2` on the `Customer` table. All the data in the column will be lost.

*/
-- RedefineTables
PRAGMA defer_foreign_keys=ON;
PRAGMA foreign_keys=OFF;
CREATE TABLE "new_Customer" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "name" TEXT NOT NULL,
    "email" TEXT,
    "phone" TEXT,
    "addressLine1" TEXT,
    "postalCode" TEXT,
    "city" TEXT,
    "country" TEXT DEFAULT 'DE',
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP
);
INSERT INTO "new_Customer" ("addressLine1", "city", "country", "createdAt", "email", "id", "name", "phone", "postalCode") SELECT "addressLine1", "city", "country", "createdAt", "email", "id", "name", "phone", "postalCode" FROM "Customer";
DROP TABLE "Customer";
ALTER TABLE "new_Customer" RENAME TO "Customer";
PRAGMA foreign_keys=ON;
PRAGMA defer_foreign_keys=OFF;
