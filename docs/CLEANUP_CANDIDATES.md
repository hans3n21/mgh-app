# Cleanup Candidates

Stand: 2026-06-16

Diese Datei sammelt Dinge, die nicht sofort geloescht werden sollen, aber spaeter bewusst aufgeraeumt werden koennen. Grundregel: Erst deaktivieren oder ersetzen, dann nach Pruefung loeschen.

## Regeln

- Keine Kundendaten, Uploads oder Mail-Inhalte hier aufnehmen.
- Keine Loeschung ohne vorherige fachliche Pruefung.
- Bei DB-Daten bevorzugt zuerst `isActive=false` oder vergleichbare Deaktivierung.
- Vor echter Loeschung pruefen, ob ein Backup existiert und ob die App ohne den Eintrag funktioniert.
- Wenn ein Eintrag inhaltlich noch wertvoll ist, lieber in aktuelles Wissen ueberfuehren statt loeschen.

## Statuswerte

| Status | Bedeutung |
|---|---|
| `deaktiviert` | In der App/DB inaktiv, aber noch vorhanden |
| `review` | Muss fachlich oder technisch geprueft werden |
| `ersetzen` | Soll durch neue Quelle/Struktur ersetzt werden |
| `loeschkandidat` | Kann nach Pruefung geloescht werden |
| `behalten` | Wurde geprueft und bleibt |

## Kandidaten

| Bereich | Typ | Kandidat | Status | Grund | Naechste Pruefung / Aktion |
|---|---|---|---|---|---|
| Wissensbasis / Dein Pickguard | `KnowledgeEntry` | `Preis fuer XL Pickguard` | deaktiviert | Preise kommen aus `PriceItem`, nicht mehr aus `KnowledgeEntry` | Nach KI-Test und Review loeschen oder als nicht-preisige Regel umarbeiten |
| Wissensbasis / Dein Pickguard | `KnowledgeEntry` | `Preis fuer Customfertigung` | deaktiviert | Preise kommen aus `PriceItem`; ggf. steckt Ablauf-/Angebotslogik im Text | Inhalt pruefen: Regel behalten, konkrete Preise entfernen |
| Wissensbasis / Dein Pickguard | `KnowledgeEntry` | `Preise fuer Standard Pickguard` | deaktiviert | Durch aktive `PriceItem`-Eintraege ersetzt | Nach erfolgreichem Preisfragen-Test loeschen |
| Wissensbasis / Dein Pickguard | `KnowledgeEntry` | `Preise fuer L Pickguard` | deaktiviert | Durch aktive `PriceItem`-Eintraege ersetzt | Nach erfolgreichem Preisfragen-Test loeschen |
| Wissensbasis / Dein Pickguard | `KnowledgeEntry` | `Preise fuer Trussrodcover` | deaktiviert | Durch aktive `PriceItem`-Eintraege ersetzt | Nach erfolgreichem Preisfragen-Test loeschen |
| Wissensbasis / Dein Pickguard | `KnowledgeEntry` | `Preise fuer Backplates` | deaktiviert | Durch aktive `PriceItem`-Eintraege ersetzt | Nach erfolgreichem Preisfragen-Test loeschen |
| Wissensbasis | Markdown-Preislisten | Preisangaben in `docs/wissensbasis/*.md` | review | Markdown ist Review-/Redaktionsquelle, nicht dauerhafte Preisquelle fuer KI | Preisangaben gegen `PriceItem` abgleichen; danach KnowledgeEntry ohne Preislisten importieren |
| KI / Prompt-Kontext | Legacy `backgroundInfo` / alte Prompt-Texte | Preislisten oder veraltete Preisangaben in Profil-/Prompt-Texten | behalten | Scan am 2026-06-16 fand keine Preisbetraege; nur fachlichen Pickguard-Kontext | Bei kuenftigen Profil-Aenderungen erneut pruefen |
| KI / Endpunkte | Alte direkte KI-Pfade neben `/api/ai/transform` | `/api/compose-message` und weitere Verbraucher | review | Mehrere KI-Pfade erschweren PII-/Preis-Konsistenz | Entweder auf `/api/ai/transform` vereinheitlichen oder dieselben Guards einbauen |

## Bereits erledigt

| Datum | Aktion |
|---|---|
| 2026-06-16 | Pickguard-Preise in `PriceItem` auf neueren hoeheren Stand aktualisiert |
| 2026-06-16 | Pickguard-Zusatzoptionen als aktive `PriceItem`-Eintraege angelegt |
| 2026-06-16 | Alte preisartige `KnowledgeEntry`-Eintraege fuer Dein Pickguard deaktiviert |
| 2026-06-16 | `/api/ai/transform` und `/api/compose-message` fuer Preisfragen auf aktive `PriceItem`-Eintraege ausgerichtet |
| 2026-06-16 | Prompt-/Profilfelder auf alte Preisbetraege gescannt; keine Preislisten gefunden |
| 2026-06-16 | `knowledge:sync` blockiert Markdown-Dateien mit Preiswarnungen beim Apply standardmaessig mit `SKIP_PRICE_REVIEW` |
| 2026-06-16 | 7 nicht-preisige Markdown-Dateien als inaktive Review-`KnowledgeEntry`s fuer Dein Pickguard importiert; 4 Preiswarn-Dateien uebersprungen |
| 2026-06-16 | Review-Eintraege `Reklamationen` und `Custom-Anfragen: Bodies, Haelse und Gitarren` aktiviert |
| 2026-06-16 | Generisches Keyword `custom` aus dem Custom-Anfragen-KnowledgeEntry entfernt, damit Pickguard-Lieferzeitfragen sauber bleiben |
| 2026-06-16 | Review-Eintraege `Storno bei Custom-Auftraegen`, `Sprache in Kundenantworten` und `Vorlagen, Dateien und Templates` aktiviert |
| 2026-06-16 | Storno-Keywords um Schreibweisen wie `custom auftrag` und `custom-auftrag` ergaenzt |
| 2026-06-17 | Preisbereinigte Import-Quellen unter `docs/wissensbasis_import_ready` erstellt |
| 2026-06-17 | Ausgelagerte Versand-/Economy-/Zahlungswerte in `docs/STRUCTURED_VALUES_REVIEW.md` als Review-Kandidaten dokumentiert |
| 2026-06-17 | Preisbereinigte KnowledgeEntries fuer Versandregeln, Pickguard-Ablauf, MGH Economy und Custom-Zahlung aktiviert |
| 2026-06-17 | Preis-Matcher gegen unpassende Produktpreise bei reinen Versandkostenfragen abgesichert |
