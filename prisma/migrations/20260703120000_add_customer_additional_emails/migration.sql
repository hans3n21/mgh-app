-- Mehrere Mailadressen pro Kunde (z. B. alte + neue Adresse parallel)
ALTER TABLE "Customer" ADD COLUMN "additionalEmails" TEXT[] NOT NULL DEFAULT ARRAY[]::TEXT[];
