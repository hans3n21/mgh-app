# Lokale Mail-Analyse

Läuft auf jedem Rechner, auf dem die MGH-App läuft, und verarbeitet Mailtexte ausschließlich
lokal:

- **Analysedienst** (dieser Ordner, Python): erkennt Personenangaben mit
  `fastino/gliner2-privacy-filter-PII-multi`. Lauscht nur auf `127.0.0.1:8766`, braucht einen
  Zugriffsschlüssel, protokolliert keine Mailinhalte und lädt im Betrieb nichts aus dem Internet.
- **Ollama** mit einem Sprachmodell (`gemma4`) für die Auftragsvorschläge (Feld, Wert, Absicht).
  Nur lokal, Cloud-Funktion aus (`OLLAMA_NO_CLOUD=1`, `OLLAMA_HOST=127.0.0.1:11434`).

Das Paket `gliner2` enthält ohne Zusatz nur einen Cloud-API-Client; installiert und genutzt wird
ausschließlich die lokale Ausführung (`gliner2[local]`).

## Einrichten und aktualisieren

Macht `update.bat` (Schritt 6) über `Install-LocalAi.ps1`:

1. Python-Umgebung und Modell des Analysedienstes, nur wenn noch nicht vorhanden oder
   `requirements.txt` / `Start-MailAi.ps1` geändert (erster Lauf ca. 2 GB).
2. Ollama bei Bedarf per `winget` (mit Rückfrage), auf „nur lokal“ stellen.
3. Sprachmodell je Rechner nach `local-ai.json`: unter 24 GB Arbeitsspeicher die kleinere
   Variante `gemma4:e4b-it-qat` (6 GB), sonst `gemma4:e4b` (10 GB). Die Wahl steht in
   `data\ollama-model.txt`; die App nimmt sie vor der Auswahl unter KI-Training.

`update.bat` läuft aus einer Kopie von sich selbst. Ein neu hinzugekommener Schritt greift deshalb
erst beim nächsten Update-Lauf: **Beim ersten Mal update.bat zweimal ausführen**, oder direkt:

```powershell
powershell -ExecutionPolicy Bypass -File services\mail-ai\Install-LocalAi.ps1
```

Fehlt Python, gibt das Skript einen Hinweis (`winget install -e --id Python.Python.3.13`); die App
läuft dann weiter mit den Regeln.

## Starten

`start-mgh-app-production.bat` und `start-mgh-app.bat` starten den Analysedienst automatisch in
einem minimierten Fenster, wenn er eingerichtet ist. Von Hand:

```powershell
.\Start-MailAi.ps1               # nur Personenerkennung (was die App nutzt)
.\Start-MailAi.ps1 -WithFields   # zusätzlich /fields (GLiNER2.5), ca. 1 GB mehr RAM
```

Das Feldmodell (1,1 GB) lädt nur `.\Start-MailAi.ps1 -Install -WithFields`; `update.bat` lässt es weg.

Läuft der Dienst schon, beendet sich ein zweiter Start ohne Fehler.

## Schlüssel und Einstellungen

Alle Rechner teilen sich eine Datenbank, aber jeder hat seinen eigenen Dienst. Für die Adresse
`http://127.0.0.1:8766` liest die App den Schlüssel deshalb direkt aus `data\access-token.txt`
dieses Rechners; in den Einstellungen muss nur „Lokale Mail-Analyse verwenden“ an sein.

## KI-Vorschläge an einem Rechner abschalten

Die Schalter in den Einstellungen gelten für alle Rechner (gemeinsame Datenbank). Soll nur ein
Rechner keine KI-Vorschläge aus Mails zeigen und berechnen, legt man dort die Datei
`services\mail-ai\data\vorschlaege-aus.txt` an; Löschen schaltet sie wieder ein, Neustart nicht nötig.
Die Personenerkennung läuft weiter, die Vorschläge aus PDF-Import und Mail-Extraktion ebenfalls.

```powershell
New-Item services\mail-ai\data\vorschlaege-aus.txt -ItemType File    # aus
Remove-Item services\mail-ai\data\vorschlaege-aus.txt                # wieder an
```

## Messen

```bash
npx tsx scripts/bench-mail-ai.ts pii
npx tsx scripts/bench-mail-ai.ts fields --model gemma4:e4b [--cpu] [--examples]
```

Testsatz: `lib/mail-ai/__fixtures__/order-cases.json` (12 erfundene Mails).
Stand 29.09.2026: Personenangaben 24/24 (Regeln + Dienst, 0,7 s je Mail);
Auftragsfelder `gemma4:e4b` 32/35, `gemma4:e4b-it-qat` 27/35.

Tests ohne Modell: `python -m unittest test_server`
