-- Wartezustand "Wartet auf Teile" + Freitext "Nächster Schritt" am Auftrag
ALTER TYPE "OrderStatus" ADD VALUE IF NOT EXISTS 'waiting_parts';
ALTER TABLE "Order" ADD COLUMN "nextStep" TEXT;
