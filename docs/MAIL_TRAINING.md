# Lokaler Trainingsmodus für Mails

## Bedienung

Im Posteingang eine eingegangene Mail öffnen und **Trainingsmodus öffnen** wählen.
Nur `admin` und `admin_no_feedback` sehen den Einstieg und dürfen die API verwenden.
Ein Modellserver ist für das manuelle Prüfen nicht erforderlich.

- Violett: Datenschutzstellen. Speichern aktualisiert die bestehende PII-Extraktion dieser Mail.
- Cyan / Gelb: Auftragsangaben sowie Fragen, Unklarheiten und mögliche Änderungen.
- Markierung oder Listeneintrag anklicken. Feld, Wert und Aussageabsicht korrigieren und einen Feedbackgrund wählen.
- Übersehene Angaben im Originaltext mit Maus oder Tastatur auswählen und eine Markierung anlegen.
- **Korrektur / Bestätigung speichern** speichert ein geprüftes Beispiel. Auftragsfelder ändern sich dabei nicht.
- **Auftragsänderung prüfen** zeigt den alten und neuen Wert. **Jetzt übernehmen** schreibt erst nach erneuter serverseitiger Prüfung.
- Fragen, verworfene Vorschläge und unbestätigte Beispiele können nicht übernommen werden.
- Die Zensierungsvorschau zeigt nur diese Mailmarkierungen, nicht den gesamten Prompt weiterer KI-Funktionen.

Die vorhandene Laya-Prüfung lässt sich optional im Trainingsmodus aufrufen. Ihre Ergebnisse bleiben unbestätigte Vorschläge. Laya wurde dadurch nicht nachtrainiert und seine bisherigen Qualitätsgrenzen bleiben bestehen.

## Lernen in dieser ersten Version

Gespeichert werden Quelle, Markierung, korrigierte Zuordnung, Absicht, Feedbackgrund,
Bearbeiter und vorheriger/nachheriger Stand. Änderungen am Auftrag haben zusätzlich einen Altwert-/Neuwert-Verlauf.

Beim Öffnen weiterer Mails werden die letzten 200 geprüften Maildatensätze **desselben Postfachs** betrachtet.
Nur bei einem vollständig identischen neuen Mailtext (ohne erkannten zitierten Verlauf) und passendem Auftragstyp werden Korrekturen als **Geprüftes Beispiel** vorgeschlagen.
Diese Vorschläge müssen erneut bestätigt werden. Veraltete Quellen und geänderte Mailzuordnungen werden ausgeschlossen.
Freigaben zuvor zensierter Stellen werden niemals automatisch auf andere Mails übertragen.

Das ist bewusst begrenzte Wiederverwendung geprüfter Beispiele. Eine allgemeine Verbesserung für ähnliche Formulierungen, Modell-Fine-Tuning und eine gemessene bessere Erkennungsrate sind noch nicht enthalten.
Gespeicherte Korrekturen bilden dafür die lokale Datengrundlage. Es gibt weder Embedding- noch Trainingsanfragen an externe Dienste.

## Datenhaltung und Installation

Neues Prisma-Modell: `MailTrainingReview`, verknüpft mit der Mail; bei endgültigem Löschen der Mail werden die Trainingsdaten mitgelöscht.
Weich gelöschte Mails werden nicht für neue Beispiele verwendet.
JSON-Backup und Restore berücksichtigen die Trainingsdaten und die zugehörigen Datenschutzmarkierungen.

Migration: `prisma/migrations/20260928120000_mail_training_review/migration.sql`.
Sie ergänzt ausschließlich eine neue Tabelle, einen Index und den Fremdschlüssel.
Sie wurde mittels `prisma migrate diff` aus dem vorherigen und neuen Schema erzeugt, ohne eine Datenbank zu verändern.

Auf dem MGH-Server zunächst `npx prisma migrate status` prüfen. Bei konsistenter Migrationshistorie die ausstehenden Migrationen wie üblich mit `npx prisma migrate deploy` installieren, dann `npx prisma generate`, Build und Neustart.
Bei einer historisch mit `db push` verwalteten Datenbank zuerst den Migrationsstand abgleichen; keinen Reset ausführen.
Am 28.09.2026 war nach Freigabe des Netzwerkzugriffs ausschließlich diese Migration offen. Sie wurde mit `prisma migrate deploy` auf der konfigurierten QNAP-Datenbank installiert. Der App-Code muss auf dem anderen MGH-Serverrechner noch aktualisiert, gebaut und neu gestartet werden.

## Prüfungen

Erweiterung: [Adminbereich KI-Training](./AI_TRAINING_ADMIN.md) beschreibt Gesprächskontext, Ollama, unabhängige Prüffälle und den lokalen Trainingsdatenexport.

`npx vitest run lib/mail-training/__tests__ lib/local-ai/__tests__`

Die Tests prüfen Adminrechte, belegte Textpositionen, Rückfragen, Quellen-/Zuordnungswechsel,
Versionskonflikte, alte Auftragswerte, Zitaterkennung, Datenschutzkorrekturen und konservative Beispielwiederverwendung.
Die Servicetests verwenden eine simulierte Prisma-Schnittstelle; sie ersetzen keinen Integrationstest mit PostgreSQL.

Ergebnis der lokalen Prüfung: 49 Tests einschließlich bestehendem Laya-Pilot erfolgreich, TypeScript und gezieltes ESLint erfolgreich, Produktionsbuild erfolgreich (bestehende Warnungen außerhalb der neuen Dateien).
Im Browser mit erfundenen Daten geprüft: getrenntes Speichern und Übernehmen, gesperrte Übernahme einer Preisfrage, Zensierungsvorschau, manuelle Auswahl über mehrere Textsegmente, Feld-/Wertkorrektur und schmale Darstellung. Keine Browserfehler. Kein Versand von Testmails.

Für eine Bedienprobe mit ausschließlich erfundenen Daten im Entwicklungsmodus:

```powershell
$env:MAIL_SYNC_WORKER_INTERVAL_MS = '0'
node node_modules/next/dist/bin/next dev --port 3100 --hostname 127.0.0.1
```

Dann `/training-demo` öffnen. Dort werden Änderungen nur im Browserzustand gehalten.
Diese Demoseite ist im Produktionsmodus nicht verfügbar.
