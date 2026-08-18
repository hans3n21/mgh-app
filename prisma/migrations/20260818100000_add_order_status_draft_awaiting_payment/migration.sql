-- Neue Auftragszustaende: Entwurf (nicht freigegeben) und Wartet auf Zahlung.
-- Additiv und idempotent; auf der Produktiv-DB bereits per db execute appliziert.
ALTER TYPE "OrderStatus" ADD VALUE IF NOT EXISTS 'draft';
ALTER TYPE "OrderStatus" ADD VALUE IF NOT EXISTS 'awaiting_payment';
