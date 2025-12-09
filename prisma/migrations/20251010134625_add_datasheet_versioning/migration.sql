/*
  Warnings:

  - You are about to drop the `Email` table. If the table is not empty, all the data it contains will be lost.
  - You are about to drop the `EmailAttachment` table. If the table is not empty, all the data it contains will be lost.
  - You are about to drop the column `code` on the `Order` table. All the data in the column will be lost.
  - You are about to drop the column `customerEmail` on the `Order` table. All the data in the column will be lost.
  - You are about to drop the column `subjectNorm` on the `Order` table. All the data in the column will be lost.
  - Added the required column `updatedAt` to the `Datasheet` table without a default value. This is not possible if the table is not empty.

*/
-- DropIndex
DROP INDEX "Email_sentAt_idx";

-- DropIndex
DROP INDEX "Email_direction_idx";

-- DropIndex
DROP INDEX "Email_status_idx";

-- DropIndex
DROP INDEX "Email_orderId_idx";

-- DropIndex
DROP INDEX "Email_fromAddress_idx";

-- DropIndex
DROP INDEX "Email_subjectNorm_idx";

-- DropIndex
DROP INDEX "Email_inReplyTo_idx";

-- DropIndex
DROP INDEX "Email_threadId_idx";

-- DropIndex
DROP INDEX "Email_messageId_key";

-- DropIndex
DROP INDEX "EmailAttachment_emailId_idx";

-- DropTable
PRAGMA foreign_keys=off;
DROP TABLE "Email";
PRAGMA foreign_keys=on;

-- DropTable
PRAGMA foreign_keys=off;
DROP TABLE "EmailAttachment";
PRAGMA foreign_keys=on;

-- RedefineTables
PRAGMA defer_foreign_keys=ON;
PRAGMA foreign_keys=OFF;
CREATE TABLE "new_Datasheet" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "orderId" TEXT NOT NULL,
    "type" TEXT NOT NULL,
    "fields" JSONB NOT NULL,
    "version" INTEGER NOT NULL DEFAULT 1,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" DATETIME NOT NULL,
    CONSTRAINT "Datasheet_orderId_fkey" FOREIGN KEY ("orderId") REFERENCES "Order" ("id") ON DELETE CASCADE ON UPDATE CASCADE
);
INSERT INTO "new_Datasheet" ("createdAt", "fields", "id", "orderId", "type") SELECT "createdAt", "fields", "id", "orderId", "type" FROM "Datasheet";
DROP TABLE "Datasheet";
ALTER TABLE "new_Datasheet" RENAME TO "Datasheet";
CREATE INDEX "Datasheet_orderId_idx" ON "Datasheet"("orderId");
CREATE TABLE "new_Order" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "title" TEXT NOT NULL,
    "type" TEXT NOT NULL,
    "status" TEXT NOT NULL DEFAULT 'intake',
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "customerId" TEXT NOT NULL,
    "assigneeId" TEXT,
    "wcOrderId" TEXT,
    "finalAmountCents" INTEGER,
    "paymentStatus" TEXT NOT NULL DEFAULT 'open',
    CONSTRAINT "Order_customerId_fkey" FOREIGN KEY ("customerId") REFERENCES "Customer" ("id") ON DELETE CASCADE ON UPDATE CASCADE,
    CONSTRAINT "Order_assigneeId_fkey" FOREIGN KEY ("assigneeId") REFERENCES "User" ("id") ON DELETE SET NULL ON UPDATE CASCADE
);
INSERT INTO "new_Order" ("assigneeId", "createdAt", "customerId", "finalAmountCents", "id", "paymentStatus", "status", "title", "type", "wcOrderId") SELECT "assigneeId", "createdAt", "customerId", "finalAmountCents", "id", "paymentStatus", "status", "title", "type", "wcOrderId" FROM "Order";
DROP TABLE "Order";
ALTER TABLE "new_Order" RENAME TO "Order";
PRAGMA foreign_keys=ON;
PRAGMA defer_foreign_keys=OFF;
