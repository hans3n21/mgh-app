# Lokaler Modelltest vom 28.09.2026

## Umgebung

- Entwicklungsrechner: AMD Ryzen 5 3600, 32 GB RAM, Windows, Python 3.12.14.
- Ausschließlich CPU, zwei PyTorch-Threads, keine GPU, eine Frage gleichzeitig.
- Laya 0.3.21, PyTorch 2.14.0+cpu, Transformers 5.17.0.
- Modell: `convaiinnovations/laya-multilingual`.
- Gewichte: `e4e9ddf21a7b1903b7acffd8814ad4307bf63a67`.
- Nur erfundene Texte. Keine Kundendaten und keine Datenbankabfragen.
- Der vorgesehene Zielrechner (i3-14100, 16 GB, Windows 11 Pro) wurde noch nicht getestet.

## Ergebnis mit der aktuellen Frageformulierung

| Fall | Erwartet | Modellurteil | Richtig |
|---|---|---|---|
| Hals aus Ahorn bestellen | Hals: bestätigt | bestätigt | ja |
| Derselbe Text, Frage nach Griffbrett aus Ahorn | Griffbrett: nicht angegeben | bestätigt | nein |
| Kein Ebenholz fürs Griffbrett | abgelehnt | abgelehnt | ja |
| Preisfrage zu Ebenholzgriffbrett | offen / Rückfrage | unklar | nein |
| 22 Edelstahlbünde bestellen | bestätigt | bestätigt | ja |
| Radius von 12 Zoll erfragen, noch nicht entschieden | offen / Rückfrage | unklar | nein |
| Änderung von Ebenholz auf Palisander, Frage nach Palisander | bestätigt | abgelehnt | nein |
| Derselbe Änderungswunsch, Frage nach Ebenholz | abgelehnt | abgelehnt | ja |

Vier von acht erwarteten Kategorien wurden richtig getroffen. Das ist ein kleiner
Funktionstest, keine belastbare Genauigkeitsmessung. Die zweite Formulierung wurde
an diesen Fällen entwickelt; sie sind deshalb auch kein unabhängiges Testset.
Ein erster Versuch mit abstrakten Feldbeschreibungen erzielte drei von acht.

Die vollständige lokale Anfrage dauerte mit bereits geladenem Modell etwa
0,33–1,46 Sekunden, abhängig von der Anzahl der Kandidaten. Diese Messung gilt
für den Entwicklungsrechner und kurze Beispiele, nicht für das NAS oder den i3.

## Konsequenz

Die lokale Infrastruktur funktioniert. Das unveränderte Laya-Modell ist in diesem
Versuch fachlich nicht zuverlässig genug. Die Funktion bleibt standardmäßig aus;
auch nach Aktivierung wird nur auf manuellen Klick analysiert. Die Analyse schreibt
keine Specs. Ein Mensch kann einen belegten Wert als offenen Vorschlag vormerken
und anschließend über die bestehende Auftragsprüfung übernehmen.

Nächster sinnvoller Schritt: ein anderes lokal ausführbares Modell vergleichen
oder Laya auf beschriftete Fachbeispiele anpassen. Qualität an zusätzlichen,
bisher unbenutzten Mails prüfen. Nicht durch niedrigere Schwellenwerte scheinbar
mehr automatische Treffer erzwingen.

## Reproduktion

Nach Dienststart im MGH-Projekt:

```powershell
npx tsx scripts/test-local-mail-ai.ts services/local-mail-ai/data/access-token.txt http://127.0.0.1:8765
```

Das Skript gibt bei abweichenden Kategorien absichtlich Exit-Code 1 zurück.
Die 31 App-Tests und fünf Python-Diensttests prüfen die Infrastruktur unabhängig
von der Modellqualität. TypeScript, gezieltes ESLint und Produktions-Build bestanden;
der Build meldete vorhandene Warnungen in anderen Komponenten.
