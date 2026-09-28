-- CreateTable
CREATE TABLE "public"."AiTrainingCase" (
    "id" TEXT NOT NULL,
    "mailId" TEXT NOT NULL,
    "accountId" TEXT NOT NULL,
    "groupKeys" TEXT[],
    "partition" TEXT NOT NULL,
    "title" TEXT NOT NULL,
    "snapshot" JSONB NOT NULL,
    "expected" JSONB NOT NULL,
    "fingerprint" TEXT NOT NULL,
    "createdBy" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "AiTrainingCase_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "public"."AiTrainingResult" (
    "id" TEXT NOT NULL,
    "caseId" TEXT NOT NULL,
    "model" TEXT NOT NULL,
    "digest" TEXT NOT NULL,
    "protocol" TEXT NOT NULL,
    "examples" JSONB NOT NULL,
    "findings" JSONB NOT NULL,
    "metrics" JSONB NOT NULL,
    "durationMs" INTEGER NOT NULL,
    "error" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "AiTrainingResult_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "AiTrainingCase_accountId_partition_idx" ON "public"."AiTrainingCase"("accountId", "partition");

-- CreateIndex
CREATE INDEX "AiTrainingResult_caseId_createdAt_idx" ON "public"."AiTrainingResult"("caseId", "createdAt");

-- AddForeignKey
ALTER TABLE "public"."AiTrainingCase" ADD CONSTRAINT "AiTrainingCase_mailId_fkey" FOREIGN KEY ("mailId") REFERENCES "public"."Mail"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "public"."AiTrainingResult" ADD CONSTRAINT "AiTrainingResult_caseId_fkey" FOREIGN KEY ("caseId") REFERENCES "public"."AiTrainingCase"("id") ON DELETE CASCADE ON UPDATE CASCADE;
