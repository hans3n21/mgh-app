-- Wortindex (Postgres-Volltextsuche) fuer den Mailtext in der Posteingang-Suche.
--
-- Die Trigram-Indizes aus 20260828150000 haben die Suche schneller gemacht,
-- aber nicht schnell genug: ein Trigram-Index liefert nur Kandidaten, und
-- Postgres muss fuer jeden Kandidaten den kompletten Mailtext aus dem
-- ausgelagerten Speicher (TOAST, auf dem NAS ~38 ms pro Mail) nachlesen, um
-- den Treffer zu bestaetigen. Das gilt auch fuer die ~80 % Papierkorb-Mails,
-- die erst danach ausgefiltert werden. Bei haeufigen Begriffen oder langen
-- Zitatverlaeufen sind das Hunderte Mails pro Suche.
--
-- Ein Wortindex (tsvector/GIN) ist fuer UND-verknuepfte Woerter (auch als
-- Wortanfang, 'gitarr:*') exakt: Postgres muss den Mailtext gar nicht mehr
-- lesen. Die Suche nach Wortanfaengen ersetzt die Teilstring-Suche im
-- Mailtext ("gitarr" findet "Gitarrenbau", "bau" findet es nicht mehr).
-- Betreff, Absender und Empfaenger bleiben bei der Teilstring-Suche ueber die
-- kleinen Trigram-Indizes.
--
-- Bewusst ein Ausdrucks-Index statt einer eigenen Spalte: kein Umschreiben
-- aller Zeilen, kein Trigger, keine Aenderung an Prisma-Schema, Mail-Sync oder
-- Backup. Die Abfrage muss dafuer exakt den Ausdruck
-- mail_search_vector("text") verwenden (lib/mail/search.ts).
--
-- Hinweis fuer update.bat: der Aufbau des Index liest die Mailtexte einmal
-- komplett, wie beim Trigram-Index am 16.09. Schritt "4. Aktualisiere
-- Datenbank-Schema" wirkt auf dem NAS etliche Minuten wie eingefroren - das
-- ist normal und einmalig.

-- 1. Der Trigram-Index auf dem Mailtext wird durch den Wortindex ersetzt.
--    Er ist mit Abstand der groesste Index der Tabelle und kostet bei jeder
--    neu synchronisierten Mail Zeit. Zuerst loeschen, damit waehrend des
--    Aufbaus nicht beide Platz belegen.
DROP INDEX IF EXISTS "Mail_text_trgm_idx";

-- 2. Wortliste eines Mailtexts.
--    'simple' statt 'german': keine Stammformen, keine Stoppwoerter - Namen
--    und Auftragsnummern bleiben wie geschrieben, das passt zur bisherigen
--    Suche. Bindestriche werden zu Leerzeichen, sonst zerlegt der Parser
--    "ORD-2026-001" in 'ord', '-2026', '-001' und die Suche nach "2026-001"
--    findet nichts. Die ersten 200.000 Zeichen reichen fuer jede echte Mail
--    und halten den Index klein.
--    Die Fehlerbehandlung ist Absicht: der Index wird bei jedem Einfuegen
--    einer Mail berechnet. Scheitert to_tsvector an einem kaputten Text
--    ("string is too long for tsvector"), darf das den Mail-Sync nicht
--    abbrechen; die Mail ist dann nur ueber Betreff/Absender auffindbar.
--    Der hohe COST-Wert haelt den Planer davon ab, den Ausdruck pro Zeile
--    auszuwerten, statt den Index zu benutzen.
CREATE OR REPLACE FUNCTION mail_search_vector(body text) RETURNS tsvector
LANGUAGE plpgsql IMMUTABLE COST 10000 AS $$
BEGIN
	RETURN pg_catalog.to_tsvector(
		'pg_catalog.simple'::pg_catalog.regconfig,
		pg_catalog.translate(pg_catalog.left(COALESCE(body, ''), 200000), '-', ' ')
	);
EXCEPTION WHEN OTHERS THEN
	RETURN NULL;
END;
$$;

-- 3. Suchbegriff -> Suchanfrage: jedes Wort als Wortanfang, alle Woerter
--    muessen vorkommen ("gitarre rechnung" -> 'gitarre':* & 'rechnung':*).
--    Gleiche Zerlegung wie mail_search_vector, damit Index und Anfrage
--    zusammenpassen. Einzelne Zeichen fallen weg ("ORD-2026-9" -> ord, 2026):
--    als Wortanfang passt 'a':* auf fast jede Mail und kostet nur Zeit.
--    Jedes Wort wird fuer die tsquery-Syntax gequotet (Backslash und
--    Hochkomma maskiert), Nutzereingaben koennen die Anfrage also nicht
--    aufbrechen. Ohne verwertbares Wort kommt NULL zurueck und der Mailtext
--    liefert keine Treffer (Betreff/Absender werden trotzdem gesucht).
CREATE OR REPLACE FUNCTION mail_search_query(term text) RETURNS tsquery
LANGUAGE sql IMMUTABLE AS $$
	SELECT pg_catalog.string_agg(
		'''' || pg_catalog.replace(pg_catalog.replace(lexeme, '\', '\\'), '''', '''''') || ''':*',
		' & '
	)::pg_catalog.tsquery
	FROM pg_catalog.unnest(pg_catalog.to_tsvector(
		'pg_catalog.simple'::pg_catalog.regconfig,
		pg_catalog.translate(pg_catalog.left(COALESCE(term, ''), 200), '-', ' ')
	))
	WHERE pg_catalog.length(lexeme) > 1
$$;

-- 4. Der Index selbst.
CREATE INDEX IF NOT EXISTS "Mail_text_fts_idx" ON "Mail" USING gin (mail_search_vector("text"));

-- 5. Keine Planer-Statistik fuer den Ausdruck: sonst wertet jedes (Auto-)
--    ANALYZE der Mail-Tabelle mail_search_vector fuer ~30.000 Stichproben aus
--    und liest dafuer wieder alle Mailtexte vom NAS. Ohne Statistik schaetzt
--    der Planer pauschal und nimmt wegen COST 10000 trotzdem den Index.
ALTER INDEX "Mail_text_fts_idx" ALTER COLUMN 1 SET STATISTICS 0;
