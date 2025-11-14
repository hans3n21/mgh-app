-- Add read status to Mail table
ALTER TABLE "Mail" ADD COLUMN "unread" BOOLEAN NOT NULL DEFAULT true;

-- Create index for performance
CREATE INDEX "Mail_unread_idx" ON "Mail"("unread");
