-- Embedding-Cache für semantisches Wissens-Matching
CREATE TABLE "KnowledgeEmbedding" (
    "entryId" TEXT NOT NULL,
    "contentHash" TEXT NOT NULL,
    "embedding" JSONB NOT NULL,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "KnowledgeEmbedding_pkey" PRIMARY KEY ("entryId")
);
