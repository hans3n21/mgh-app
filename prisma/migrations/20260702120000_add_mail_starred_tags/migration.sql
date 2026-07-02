-- Persistenz für Stern-Markierung und Tags auf Mails
ALTER TABLE "Mail" ADD COLUMN "starred" BOOLEAN NOT NULL DEFAULT false;
ALTER TABLE "Mail" ADD COLUMN "tags" TEXT[] NOT NULL DEFAULT ARRAY[]::TEXT[];
