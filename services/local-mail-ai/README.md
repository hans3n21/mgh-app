# Lokale Mailprüfung: erster Versuch mit Laya

**Stand 28.09.2026: technischer Pilot, noch nicht für automatische Übernahmen geeignet.**
Der echte CPU-Test auf dem Entwicklungsrechner lief erfolgreich durch, aber nur
**4 von 8 synthetischen Entscheidungen** waren inhaltlich richtig. Insbesondere
Bauteilzuordnung, Rückfragen und spätere Änderungen waren fehlerhaft. Der Versuch
ist dazu da, diese Grenzen sichtbar zu prüfen. Vor einem Alltagseinsatz muss ein
geeigneteres Modell oder eine gezielte Modellanpassung an getrennten Testdaten
bewertet werden. Details stehen in `TESTERGEBNIS.md`.

Der Dienst läuft unabhängig vom MGH-Server auf einem Rechner im lokalen Netz.
Ein Browser auf diesem Rechner allein genügt nicht: Der **MGH-Server** muss den
KI-Dienst erreichen können. Läuft MGH extern, ist dafür eine private VPN-Verbindung
erforderlich. Den KI-Port nicht über eine Router-Portfreigabe veröffentlichen.

## Was der Pilot macht

- Die manuelle Aktion „Lokal prüfen · Pilot“ erscheint bei einer zugeordneten
  Eingangsmail, sobald ein Admin die Funktion in den Einstellungen aktiviert.
- Bekannte Holzbegriffe, Bundangaben und ausdrücklich beschriftete Mensur-/Radiuswerte
  werden aus dem neuen Klartext der Mail gesammelt. Alte Zitate werden entfernt.
- Laya beurteilt für jedes erlaubte Feld: verbindlich gewünscht, offen/Frage,
  abgelehnt oder nicht eindeutig zugeordnet. Auch falsche Zuordnungen werden
  angezeigt, damit die Modellqualität überprüfbar bleibt.
- Neben dem Ergebnis stehen der bisherige Auftragswert und ein Ausschnitt aus
  der Quelle. „Als Auftragsvorschlag vormerken“ erzeugt einen offenen Vorschlag.
  Erst das bestehende Annehmen des Vorschlags ändert das Datenblatt.
- Der Pilot verarbeitet keine Anhänge, Bilder, HTML-only-Mails oder gesamten Threads.
  Zusammengesetzte Wörter wie „Ahornhals“, freie Reparaturtexte, Pickup-Namen und
  unbeschriftete Maße werden noch nicht erkannt. Mehrdeutige oder unbekannte Begriffe
  nicht automatisch übernehmen.

## Stationärer Windows-Rechner (bevorzugter Versuch)

Voraussetzung: 64-Bit-Windows und Python 3.12, verfügbar als `python` oder mit
vollständigem Pfad. Python gibt es unter <https://www.python.org/downloads/windows/>.
Für den ersten Download von Python-Paketen und Modellgewichten wird Internet benötigt.
Der Dienst lädt genau einen mehrsprachigen Modellstand auf die CPU. Eine GPU ist
für diesen Versuch nicht erforderlich. Genügend RAM zusätzlich zur laufenden App
und mehrere GB freien Speicher vorsehen; Zielhardware und Leistung sind noch zu testen.

1. Diesen Ordner `services/local-mail-ai` vollständig auf den Zielrechner kopieren.
2. PowerShell im kopierten Ordner öffnen und einmal installieren/starten:

   ```powershell
   .\Start-LocalMailAi.ps1 -Install -ListenAddress 0.0.0.0
   ```

   Falls Python nicht im PATH liegt:

   ```powershell
   .\Start-LocalMailAi.ps1 -Install -ListenAddress 0.0.0.0 -PythonExe 'C:\Pfad\zu\Python312\python.exe'
   ```

   Falls die lokale Ausführungsrichtlinie das Skript blockiert, kann es für diesen
   einzelnen Start so ausgeführt werden:

   ```powershell
   powershell -NoProfile -ExecutionPolicy Bypass -File .\Start-LocalMailAi.ps1 -Install -ListenAddress 0.0.0.0
   ```

3. Der erste Start lädt das Modell. Der zufällige Zugriffsschlüssel wird in
   `data/access-token.txt` gespeichert. Den Inhalt nur in die MGH-Einstellungen
   kopieren; nicht in Git oder Chat posten. Dieser Ordner ist bereits ignoriert.
4. In der Windows-Firewall eingehenden TCP-Port **8765** nur für das private Netz
   und möglichst nur für die IP des MGH-Servers freigeben. Dafür ist ggf. ein
   Windows-Administrator nötig. Dem Zielrechner im Router eine feste DHCP-Zuordnung geben.
5. Nach Installation der aktualisierten MGH-App unter **Einstellungen → Lokale
   Mailprüfung** die Adresse `http://<private-PC-IP>:8765`, den Zugriffsschlüssel
   und die Aktivierung speichern. Bei Betrieb auf demselben Rechner wie der
   MGH-Server `http://127.0.0.1:8765` nutzen; dann reicht der Skriptstart ohne
   `-ListenAddress` und ohne Firewallfreigabe.
6. Zuerst „Lokal testen“ mit dem eingebauten erfundenen Beispiel ausführen.
7. Danach eine kurze Eingangsmail einem Auftrag zuordnen und „Lokal prüfen · Pilot“
   anklicken. Die Analyse allein speichert keine Vorschläge und ändert keine Specs.

Spätere Starts benötigen kein `-Install`:

```powershell
.\Start-LocalMailAi.ps1 -ListenAddress 0.0.0.0
```

Das PowerShell-Fenster muss für diesen manuellen Versuch geöffnet bleiben.
Mit Strg+C beenden. Ist der Rechner ausgeschaltet, funktioniert MGH weiter;
die lokale Prüfung meldet, dass der Dienst nicht erreichbar ist. Ein automatischer
Start bei Anmeldung kann nach erfolgreichem Test eingerichtet werden.

### Bereitschaft prüfen

Auf dem Dienstrechner in einem zweiten PowerShell-Fenster im Dienstordner:

```powershell
$localAiKey = (Get-Content -LiteralPath .\data\access-token.txt -Raw).Trim()
Invoke-RestMethod -Uri http://127.0.0.1:8765/health -Headers @{ Authorization = "Bearer $localAiKey" }
```

`loading` bedeutet Download/Modellstart, `ready` bedeutet bereit, `failed` bedeutet
Startfehler. Bei `failed` Installation, freien RAM und Internetzugriff für den ersten
Modelldownload prüfen. Danach den Dienst neu starten. Schlüssel, Mailtexte und
Modellantworten werden nicht in Zugriffslogs geschrieben.

## Optional: QNAP TS-432X mit 4 GB

Der Windows-Rechner ist der bevorzugte erste Versuch. Die ARM64-Kompatibilität
und der tatsächliche Speicherbedarf auf der TS-432X sind noch nicht praktisch geprüft.

Der Ordner enthält zusätzlich Dockerfile und `compose.yaml` für Container Station
mit Docker Compose. Den gesamten Ordner auf das NAS kopieren. Vor dem Start den
Platzhalter für `MGH_AI_TOKEN` in der Compose-Konfiguration durch einen zufälligen
Schlüssel mit mindestens 32 Zeichen (Buchstaben/Ziffern/`_`/`-`) ersetzen.
Vom Ordner aus `docker compose up --build -d` ausführen oder das entsprechende
Compose-Projekt mit diesem Build-Verzeichnis in Container Station starten.

Der Container nutzt höchstens 2 GB RAM und 2 CPU-Kerne. Er startet bei Fehlern
nicht automatisch neu. Das Speicherlimit ist eine Schutzgrenze, keine Zusage, dass
das Modell damit läuft. Bei Speicherfehlern nicht auf dem 4-GB-NAS weiter erhöhen;
den stationären Rechner verwenden. `docker compose down` stoppt den Versuch und
behält das Modellvolume. Es werden keine NAS-Freigaben mit Kundendaten eingebunden.

## Qualität prüfen

Für jeden Fall den tatsächlichen Wunsch vorab festlegen und mit dem Ergebnis
vergleichen. Vorschläge erst nach Sichtprüfung annehmen. Mindestens diese Fälle testen:

| Text (Auftragstyp NECK) | Erwartung |
|---|---|
| Bitte den Hals aus Ahorn. | Hals-Holz Ahorn bestätigt, Griffbrett nicht angegeben |
| Kein Ebenholz fürs Griffbrett. | Ebenholz für Griffbrett abgelehnt |
| Was kostet ein Griffbrett aus Ebenholz? | Rückfrage, nicht bestätigt |
| Bitte 22 Edelstahlbünde. | Bundangabe bestätigt |
| Wäre ein Radius von 12 Zoll möglich? Noch nicht entschieden. | Radius offen |
| Zunächst wollte ich Ebenholz. Jetzt bitte Palisander fürs Griffbrett. | Palisander gewünscht; Ebenholz nicht mehr bestätigt |
| Bitte Ahorn. + zitierte ältere Nachricht mit Ebenholz | Altes Ebenholz wird nicht als neue Angabe erfasst |

Anschließend 30–50 repräsentative Mails manuell bewerten, insbesondere falsche
Bestätigungen zählen. Prozentwerte sind Modellbewertungen, keine gemessenen
Trefferquoten. Das Laya-Projekt dokumentiert deutliche Grenzen ohne Anpassung an
die eigene Aufgabe. Dieser Pilot automatisiert deshalb keine Auftragsänderungen.

## Technische Grenzen und Betrieb

- Anfrage nur an private IPv4-Adressen oder `127.0.0.1`; keine öffentlichen Hosts,
  DNS-Namen oder Weiterleitungen. Keine Cloud-Ausweichverbindung.
- Mailinhalt wird nur an den konfigurierten lokalen Dienst übertragen. Der Dienst
  schreibt keine Mailinhalte auf Platte. Modell- und Python-Downloads enthalten keine Mails.
- Bearbeitung einer Anfrage gleichzeitig; zusätzliche Anfragen erhalten 503.
- Maximal 24 Kandidaten, 6.000 Zeichen und ein geprüftes Tokenbudget. Zu lange
  Mails werden abgewiesen, damit spätere Korrekturen nicht unbemerkt abgeschnitten werden.
- App-Zeitlimit: 120 Sekunden. Ein laufender CPU-Aufruf im Dienst kann darüber hinaus
  weiterlaufen; dann bis zum Abschluss warten oder den Dienst neu starten.
- Laya und die zentralen Modellbibliotheken sind auf den getesteten Stand festgelegt.
  Der erste Start verwendet Modell-Commit `e4e9ddf21a7b1903b7acffd8814ad4307bf63a67` und speichert ihn
  in `data/model-revision.txt`; Folgestarts verwenden ihn wieder. Python-Unterabhängigkeiten
  werden bei Installation aufgelöst. Nach einem erfolgreichen Zielgerätetest den Stand
  mit `.\.venv\Scripts\python.exe -m pip freeze` dokumentieren.
- Der Zugriffsschlüssel wird wie vorhandene KI-Konfiguration in `SystemSetting`
  gespeichert. DB-Backups entsprechend vertraulich behandeln.
- Zurücksetzen: in den MGH-Einstellungen deaktivieren, Dienst stoppen. Bestehende
  offene Vorschläge bleiben zur manuellen Bearbeitung verfügbar.

## Entwicklungstests ohne Modell

```powershell
# Im MGH-Projekt
npx vitest run lib/local-ai/__tests__
# In diesem Dienstordner
python -B -m unittest test_server.py
```

Diese Tests prüfen Quellenbindung, Eingabegrenzen, Authentifizierung, erlaubte
Ziele und das Speichern als offenen Vorschlag. Sie messen keine Modellqualität.

Quellen: [Laya](https://github.com/NandhaKishorM/laya),
[mehrsprachiger Modellstand](https://huggingface.co/convaiinnovations/laya-multilingual).
