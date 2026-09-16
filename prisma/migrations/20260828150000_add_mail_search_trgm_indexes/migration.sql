-- Trigram-Indizes fuer die Posteingang-Suche.
--
-- Die Suche macht ILIKE '%…%' ueber Betreff, Absender, Empfaenger und den
-- kompletten Mailtext. Ohne Index muss Postgres fuer jede Mail den Text aus
-- dem ausgelagerten Speicher (TOAST, ~3 GB zusammen mit html) holen. Auf dem
-- NAS sind das Zufallszugriffe mit ~38 ms pro Mail; gemessen am 16.09.2026
-- (~37.000 Mails, davon 80 % im Papierkorb, der mitgesucht wird):
--   haeufiger Begriff ("Gitarre"):    32 s
--   seltener Begriff, ohne Papierkorb: 15 s
--   seltener Begriff, mit Papierkorb: Abbruch nach 150 s
-- Beim Tippen stauen sich mehrere solcher Abfragen zu Minuten.
--
-- Mit gin_trgm_ops beantwortet Postgres ILIKE '%…%' (ab 3 Zeichen) ueber den
-- Index und liest nur noch die Kandidaten nach. pg_trgm ist seit Postgres 13
-- "trusted", der DB-User braucht dafuer keine Superuser-Rechte.
--
-- Hinweis fuer update.bat: der Aufbau des Text-Index liest die Mailtexte
-- einmal komplett und dauert auf dem NAS eher zehn Minuten als eine. Schritt
-- "4. Aktualisiere Datenbank-Schema" wirkt in der Zeit wie eingefroren — das
-- ist normal und einmalig. Waehrenddessen ist die Mail-Tabelle fuer Schreib-
-- zugriffe gesperrt; die App soll beim Update ohnehin nicht laufen.
CREATE EXTENSION IF NOT EXISTS pg_trgm;

-- Kleine Felder zuerst (Sekunden), der grosse Text-Index zuletzt.
CREATE INDEX IF NOT EXISTS "Mail_subject_trgm_idx"   ON "Mail" USING gin (subject gin_trgm_ops);
CREATE INDEX IF NOT EXISTS "Mail_fromName_trgm_idx"  ON "Mail" USING gin ("fromName" gin_trgm_ops);
CREATE INDEX IF NOT EXISTS "Mail_fromEmail_trgm_idx" ON "Mail" USING gin ("fromEmail" gin_trgm_ops);
CREATE INDEX IF NOT EXISTS "Mail_toEmail_trgm_idx"   ON "Mail" USING gin ("toEmail" gin_trgm_ops);
CREATE INDEX IF NOT EXISTS "Mail_text_trgm_idx"      ON "Mail" USING gin (text gin_trgm_ops);
