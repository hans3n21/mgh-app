# KI-Training für Admins

## Aufruf und Ablauf

Neuer Navigationspunkt **KI-Training** (`/app/ki-training`), zusätzlich aus Einstellungen und dem Trainingsmodus einer Mail erreichbar. Seite und API prüfen serverseitig die Rollen `admin` und `admin_no_feedback`.

1. Im Posteingang den Trainingsmodus öffnen und Markierungen prüfen. Wünsche, Preisfragen, Änderungen und Ablehnungen getrennt kennzeichnen. Übersehene Angaben manuell markieren; falsche Vorschläge verwerfen.
2. **Als Prüffall speichern**: Fallbezeichnung, Lernfall oder Testfall wählen und ausdrücklich bestätigen, dass die aktuelle Mail vollständig geprüft ist. Nur gespeicherte, aktive Markierungen werden zur erwarteten Antwort. Eine vollständig geprüfte Mail ohne relevante Angaben ist ebenfalls möglich.
3. Im Adminbereich Fälle und Modelle auswählen, Vergleich starten. Die UI arbeitet Fall/Modell-Kombinationen nacheinander ab. „Nach diesem Lauf stoppen“ stoppt die verbleibende Liste, nicht den bereits laufenden Request. Geschlossene Tabs starten keine weiteren Läufe.
4. Ergebnisse mit Belegen und Laufzeit prüfen. Unabhängige Testfälle bleiben von den beigefügten Lernbeispielen ausgeschlossen. Eine bessere Erkennung auf wenigen Lernfällen ist kein Nachweis für zuverlässige Erkennung neuer Mails.
5. Für die Mailprüfung ein installiertes Ollama-Modell auswählen und aktivieren. Erst nach der manuellen Prüfung kann ein einzelner Vorschlag separat in den Auftrag übernommen werden.

## Lokaler Dienst auf dem anderen Windows-PC

Ollama installieren. Auf dem Rechner, auf dem Ollama tatsächlich läuft:

```powershell
[Environment]::SetEnvironmentVariable("OLLAMA_NO_CLOUD", "1", "User")
# Ollama vollständig beenden und neu starten, damit die Variable übernommen wird.
ollama pull qwen3.5:4b
# Optional für einen Vergleich:
ollama pull qwen3.5:9b
```

Die Downloads brauchen Internet. Der MGH-Server spricht anschließend standardmäßig `http://127.0.0.1:11434` an. Diese Adresse meint den **Server-PC**, nicht den Browser-PC oder das QNAP. Auf dem i3-14100 mit 16 GB zuerst 4B testen; 9B ist ein Vergleichskandidat, keine zugesicherte Empfehlung für ausreichende Geschwindigkeit. Auf dem Zielrechner wurde noch kein Benchmark durchgeführt.

Die App erlaubt ausschließlich Loopback/private IPv4-Adressen ohne Credentials/Pfad und folgt keinen Redirects. Nur lokal gelistete GGUF-Modelle mit vorhandenen Gewichten werden zugelassen; Cloud-Namen und `remote_host`/`remote_model` werden gesperrt. `/api/show` wird vor Übertragung von Mailtext geprüft. Admins bestätigen zusätzlich den lokalen Dienstbetrieb ohne Cloud-Funktion oder externen Proxy. Eine private Adresse allein beweist nicht, was ein administrativ konfigurierter Proxy dahinter tut.

Kein automatischer Modell-Download, kein Cloud-Fallback. Modellanfragen haben 180 Sekunden Timeout, strukturierte JSON-Ausgabe, Temperatur 0, Seed 42, maximal 16.384 Kontexttokens und 2.500 Ausgabetokens. Unterstützte Denkmodi werden abgeschaltet; `keep_alive: 0` fordert das Entladen an. Innerhalb eines Serverprozesses ist nur ein Ollama-Lauf gleichzeitig zugelassen. Mehrere Serverprozesse benötigen eine gemeinsame Queue, bevor diese Betriebsform verwendet wird.

## Gesprächskontext und Belege

- Aktuelle Mail plus bis zu elf frühere Mails; eingehend und ausgehend. Gleicher Account, zeitlich vor der aktuellen Mail, gleicher Auftrag oder derselbe Thread/Antwortbezug ohne abweichenden Auftrag. Gelöschte Mails ausgeschlossen.
- Direkte Vorgängermail wird nach Möglichkeit auch dann aufgenommen, wenn sie nicht unter den letzten elf liegt. Bei der begrenzten Suche wird die Zahl ausgelassener Mails als Untergrenze angezeigt.
- Rollen: MGH bei bekanntem internem Absender oder Postfachadresse, sonst Kunde bzw. unbekannt. Anhänge werden in diesem Schritt nicht ausgewertet.
- Zitierte Wiederholungen werden mit dem bestehenden Quote-Parser entfernt. Maximal 8.000 Zeichen je Mail und 24.000 Zeichen im Gespräch; zu große Ausschnitte liefern einen Fehler. Prompt inklusive Beispielen ist ebenfalls begrenzt. Erkennbar gekürzte Antworten werden verworfen.
- Aktuelle Auftragswerte werden nicht in historische Testeingaben aufgenommen. Sie bleiben im Mailprüfer lediglich der Vergleichswert vor einer ausdrücklich bestätigten Änderung.
- Jeder Modellfund braucht eine überprüfbare wörtliche Stelle in der aktuellen Mail. Ein indirekter Wert braucht ein passendes wörtliches Zitat im Verlauf. Wiederholte Zitate können mit einem Vorkommensindex eindeutig markiert werden. Die mechanische Belegprüfung garantiert keine semantisch richtige Interpretation.
- Kontextabhängige Markierungen bekommen einen Kontext-Hash. Bei Review oder Übernahme wird er erneut geprüft. Sie werden nicht durch den alten Abgleich identischer Einzelmails wiederverwendet.

## Lernen und fair vergleichen

`AiTrainingCase` speichert den festen Gesprächsausschnitt, erwartete Funde, Fingerprint, Bearbeiter und Gruppenschlüssel. Ein Fall je Quellmail; Ersetzen geschieht durch bewusstes Löschen und erneutes Anlegen. Fälle sind keine laufend veränderte Sicht auf aktuelle Auftragsdaten.

Kunde (ID und bekannte Absenderadresse), Auftrag und Thread werden gruppiert. Eine serialisierbare Transaktion verhindert, dass bekannte gemeinsame Gruppen zugleich Lern- und Testdaten liefern. Neue Alias-Adressen ohne Kunden-/Auftrags-/Threadverknüpfung können nicht automatisch als derselbe Kunde erkannt werden. Nach manueller Neuzuordnung oder Wiederherstellung alter Daten muss die Aufteilung erneut kontrolliert werden. Bereits zum Trainieren oder zur Promptoptimierung verwendete Fälle werden durch Löschen und Neuaufnahme nicht wieder zu unabhängigen Tests.

Mit Lernbeispielen: Auswahl aus freigegebenen Lernfällen desselben Accounts und Auftragstyps, höchstens zwei Fälle aus anderen Gruppen. Auswahl anhand gemeinsamer Wörter, ohne externen Embeddingdienst. Verfügbare Quellen werden geprüft. Die Beispiele werden im Prompt beigefügt; **die Modellgewichte ändern sich dadurch nicht**.

Vergleich:

- Regeln: frische Regex-/Kontexterkennung und vorhandene Kandidatenbildung, ohne heutige Kunden-DB oder korrigierten Extraktionscache.
- Laya: bestehender Pilot auf der aktuellen Mail, nur unterstützte Auftragsfelder. Keine Datenschutzprüfung und kein Gesprächskontext.
- Ollama: aktuelle Mail mit Gesprächsverlauf und optionalen freigegebenen Beispielen. Auch andere lokal importierte GGUF-Checkpoints sind über die installierte Modellliste wählbar.

Das ist ein Vergleich der gesamten Erkennungspipelines, kein kontrollierter Architekturvergleich mit identischer Aufgabenstellung. Jev/Kev sind nicht integriert. Die Vorschlagsmodelle bleiben austauschbar; ein neuer Dienst braucht einen eigenen geprüften Adapter.

Pro Lauf werden Modellname/-Digest, Protokollversion, verwendete Fall-Fingerprints, Ergebnis, Fehler und Gesamtlaufzeit gespeichert. Auftragsfunde zählen nur bei richtigem Feld, Wert und richtiger Absicht. Datenschutzfunde verlangen zusätzlich die exakte Stelle. Doppelte Treffer erhöhen nicht die Zahl richtiger Ergebnisse. Fehlerhafte Läufe werden deutlich als Fehler gezeigt. Modellwahrscheinlichkeiten werden nicht als gemessene Genauigkeit ausgegeben.

Der JSONL-Export enthält **alle verfügbaren Lernfälle**, keine Testfälle. Originaltexte bleiben enthalten; die Datei ist ausschließlich für einen separat eingerichteten lokalen Trainingsprozess gedacht. Ein echtes LoRA-/Gewichtetraining und dessen Ausführungsumgebung sind noch nicht eingerichtet. Nach lokalem Training und Import in Ollama kann der neue Checkpoint mit denselben Testfällen verglichen werden.

## Datenhaltung, Betrieb und Tests

- Migration: `20260928160000_ai_training_admin` (zwei additive Tabellen), Prisma-Client regenerieren. Migration auf der konfigurierten QNAP-Datenbank angewendet und Status geprüft.
- Backup/Restore berücksichtigt Fälle und Ergebnisse. Die neuen Dateipfade fehlen in älteren Backups regulär. Backup-Wiederherstellung wurde für diesen Schritt nicht praktisch ausgeführt.
- Löschen der Quellmail entfernt ihre Fälle/Läufe per FK. Wird eine Kontextmail gelöscht, werden betroffene Fälle in der Übersicht gesperrt und ihre Inhalte ausgeblendet; sie bleiben dort löschbar. Kein Export und keine Auswertung dieser Fälle. Die gespeicherten Snapshots sind damit noch nicht physisch aus allen Backups oder Fallzeilen entfernt; bei einer Datenlöschung ist auch deren Aufbewahrung zu berücksichtigen.
- Zugriff auf Kundenmails ausschließlich lokal; Webrecherche und Browser-Demo enthalten keine Kundendaten. Die vorhandenen externen Antwort-/Übersetzungsfunktionen behalten ihre eigene PII-Pipeline. Diese Integration ist keine Garantie, dass diese ältere Pipeline jede personenbezogene Angabe erkennt.
- Browser-Demo: `/ai-training-demo`, nur in Entwicklung. Zeigt dieselbe Oberfläche mit erfundenen Daten und ausdrücklich simulierten Modellantworten, ohne API-/DB-Schreibzugriffe. Kein Qualitätsbenchmark.
- Automatisierte Prüfungen: Kontextbegrenzung, historische Rollen/Zeiten, echte Belege, wiederholte Namen, Metriken, lokale Endpunktgrenze, Cloud-Stubs, Adminrechte, Versionen, Gruppentrennung und Trainingsdatenexport; zusätzlich bestehende Mail-Training-/Laya-Tests.
- Lokaler Prüfstand: 69 Tests erfolgreich. Browserablauf mit synthetischen Daten geprüft: Modellwahl, Speichern, Vergleich mehrerer Verfahren, Gesprächsbelege und gesperrter Export ohne Lernfälle. Keine Browserfehler; mobile Ansicht bei 390 Pixeln ohne seitlichen Überlauf. Kein echter Qwen-Benchmark auf dem Zielrechner.

Quellen zum lokalen Dienst: [Ollama FAQ](https://docs.ollama.com/faq), [Chat API](https://docs.ollama.com/api/chat), [lokale Modellliste](https://docs.ollama.com/api/tags), [strukturierte Ausgaben](https://docs.ollama.com/capabilities/structured-outputs).
