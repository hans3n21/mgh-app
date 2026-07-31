-- Papierkorb fuer Auftraege: Loeschen setzt nur noch "deletedAt", statt die Zeile
-- zu entfernen. Wichtig, weil an der Auftragszeile per ON DELETE CASCADE auch die
-- Bilder haengen — und deren Inhalt steht als Base64 direkt in OrderImage.path.
-- Ein Fehlklick auf den Muelleimer hat damit bisher die komplette Fotodokumentation
-- eines Auftrags unwiederbringlich vernichtet.
ALTER TABLE "Order" ADD COLUMN "deletedAt" TIMESTAMP(3);

-- Alle Listen und Zaehler filtern auf deletedAt IS NULL.
CREATE INDEX "Order_deletedAt_idx" ON "Order"("deletedAt");
