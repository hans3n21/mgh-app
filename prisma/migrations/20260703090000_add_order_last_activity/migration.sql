-- "Liegt seit": letzte fachliche Aktivität am Auftrag
ALTER TABLE "Order" ADD COLUMN "lastActivityAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP;

-- Backfill: bester bekannter Aktivitätszeitpunkt aus vorhandenen Daten
-- (neueste Nachricht, neuestes Datenblatt, neueste zugeordnete Mail — sonst createdAt)
UPDATE "Order" o SET "lastActivityAt" = GREATEST(
  o."createdAt",
  COALESCE((SELECT MAX(m."createdAt") FROM "Message" m WHERE m."orderId" = o.id), o."createdAt"),
  COALESCE((SELECT MAX(d."createdAt") FROM "Datasheet" d WHERE d."orderId" = o.id), o."createdAt"),
  COALESCE((SELECT MAX(ml."date") FROM "Mail" ml WHERE ml."orderId" = o.id), o."createdAt")
);
