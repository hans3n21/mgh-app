-- CreateTable
CREATE TABLE "public"."MailTrainingReview" (
    "mailId" TEXT NOT NULL,
    "sourceHash" TEXT NOT NULL,
    "orderId" TEXT,
    "revision" INTEGER NOT NULL DEFAULT 0,
    "annotations" JSONB NOT NULL,
    "history" JSONB NOT NULL,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "MailTrainingReview_pkey" PRIMARY KEY ("mailId")
);

-- CreateIndex
CREATE INDEX "MailTrainingReview_updatedAt_idx" ON "public"."MailTrainingReview"("updatedAt");

-- AddForeignKey
ALTER TABLE "public"."MailTrainingReview" ADD CONSTRAINT "MailTrainingReview_mailId_fkey" FOREIGN KEY ("mailId") REFERENCES "public"."Mail"("id") ON DELETE CASCADE ON UPDATE CASCADE;
