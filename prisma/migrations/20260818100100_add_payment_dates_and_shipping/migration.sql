-- Zahlungsdaten fuer die Abrechnung (angezahlt am / bezahlt am) und
-- Versandkosten, die beim Shop-Sync als Versandposition mitgehen.
-- Additiv und idempotent; auf der Produktiv-DB bereits per db execute appliziert.
ALTER TABLE "Order"
  ADD COLUMN IF NOT EXISTS "depositPaidAt" TIMESTAMP(3),
  ADD COLUMN IF NOT EXISTS "paidAt" TIMESTAMP(3),
  ADD COLUMN IF NOT EXISTS "shippingCents" INTEGER;
