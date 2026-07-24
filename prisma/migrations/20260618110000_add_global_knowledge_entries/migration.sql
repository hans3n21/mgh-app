-- Additive global knowledge table. Existing per-mail-account KnowledgeEntry rows stay unchanged.
CREATE TABLE "GlobalKnowledgeEntry" (
    "id" TEXT NOT NULL,
    "title" TEXT NOT NULL,
    "keywords" TEXT[],
    "content" TEXT NOT NULL,
    "category" TEXT,
    "status" TEXT NOT NULL DEFAULT 'review',
    "kiFreigabe" BOOLEAN NOT NULL DEFAULT false,
    "isActive" BOOLEAN NOT NULL DEFAULT false,
    "sourcePath" TEXT,
    "sortOrder" INTEGER NOT NULL DEFAULT 0,
    "createdBy" TEXT,
    "updatedBy" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "GlobalKnowledgeEntry_pkey" PRIMARY KEY ("id")
);

CREATE INDEX "GlobalKnowledgeEntry_status_kiFreigabe_isActive_idx" ON "GlobalKnowledgeEntry"("status", "kiFreigabe", "isActive");
CREATE INDEX "GlobalKnowledgeEntry_category_idx" ON "GlobalKnowledgeEntry"("category");
CREATE INDEX "GlobalKnowledgeEntry_sortOrder_idx" ON "GlobalKnowledgeEntry"("sortOrder");
