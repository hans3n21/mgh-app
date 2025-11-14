-- CreateTable
CREATE TABLE "Mail" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "messageId" TEXT NOT NULL,
    "fromName" TEXT,
    "fromEmail" TEXT,
    "to" JSONB,
    "cc" JSONB,
    "bcc" JSONB,
    "subject" TEXT,
    "text" TEXT,
    "html" TEXT,
    "date" DATETIME,
    "inReplyTo" TEXT,
    "references" JSONB,
    "hasAttachments" BOOLEAN NOT NULL DEFAULT false,
    "parsedData" JSONB,
    "orderId" TEXT,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" DATETIME NOT NULL,
    CONSTRAINT "Mail_orderId_fkey" FOREIGN KEY ("orderId") REFERENCES "Order" ("id") ON DELETE SET NULL ON UPDATE CASCADE
);

-- CreateTable
CREATE TABLE "Attachment" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "mailId" TEXT NOT NULL,
    "filename" TEXT NOT NULL,
    "mimeType" TEXT,
    "size" INTEGER,
    "storagePath" TEXT NOT NULL,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "Attachment_mailId_fkey" FOREIGN KEY ("mailId") REFERENCES "Mail" ("id") ON DELETE RESTRICT ON UPDATE CASCADE
);

-- CreateIndex
CREATE UNIQUE INDEX "Mail_messageId_key" ON "Mail"("messageId");

-- CreateIndex
CREATE INDEX "Mail_orderId_idx" ON "Mail"("orderId");

-- CreateIndex
CREATE INDEX "Attachment_mailId_idx" ON "Attachment"("mailId");
