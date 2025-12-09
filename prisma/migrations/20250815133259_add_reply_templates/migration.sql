-- CreateTable
CREATE TABLE "ReplyTemplate" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "key" TEXT NOT NULL,
    "lang" TEXT NOT NULL DEFAULT 'de',
    "subject" TEXT,
    "body" TEXT NOT NULL,
    "variables" JSONB,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" DATETIME NOT NULL
);

-- CreateIndex
CREATE UNIQUE INDEX "ReplyTemplate_key_key" ON "ReplyTemplate"("key");

-- CreateIndex
CREATE INDEX "ReplyTemplate_lang_idx" ON "ReplyTemplate"("lang");

-- CreateIndex
CREATE INDEX "ReplyTemplate_key_idx" ON "ReplyTemplate"("key");
