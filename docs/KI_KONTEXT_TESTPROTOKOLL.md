# KI Kontext Testprotokoll

Stand: 2026-06-17

Ziel: Pruefen, welche internen Kontextquellen die KI fuer typische Kundenfragen erhalten wuerde. Dieser Test ist ein Dry-Run: kein externer KI-Call, keine Kundendaten, keine Schreiboperationen ausser diesem Protokoll.

## Quelle

- Ziel-Postfach: Dein Pickguard (`cmmepxgcl000161pglisrfl7f`)
- Aktive `KnowledgeEntry`s: 14
- Inaktive Review-`KnowledgeEntry`s: 2
- Inaktive alte Preis-`KnowledgeEntry`s: 6
- Aktive `PriceItem`s: 80

## Ergebnisse

| Testfall | Ergebnis | Bewertung |
|---|---|---|
| Preisfrage: Sparkle Pickguard fuer Stratocaster | Preisfrage erkannt; Treffer: `L Pickguard = Standard 89 EUR / Sparkle 110 EUR / Tortoise/Pearl/Special 149 EUR`; keine Knowledge-Treffer | gut; Preis kommt aus `PriceItem` |
| Lieferzeit Pickguard | Keine Preisfrage; Knowledge-Treffer: `Fertigungszeit`, `Pickguard Ablauf und Regeln`, `Lieferung der Customfertigung` | gut; Ablauf/Lieferung kommt aus aktivem Wissen |
| Pickguard Ablauf | Keine Preisfrage; Knowledge-Treffer: `Pickguard Ablauf und Regeln`, `Fertigungszeit`, `Lieferung der Customfertigung`, `Vorlagen, Dateien und Templates` | gut; preisbereinigter Ablauf wird gefunden |
| Versand kleine Bestellung | Preisfrage erkannt; keine `PriceItem`-Treffer; Knowledge-Treffer: `Versandregeln`, `Lieferung der Customfertigung` | gut; keine unpassenden Produktpreise im Kontext |
| Reklamation | Keine Preisfrage; Knowledge-Treffer: `Reklamationen` | gut; Reklamationswissen wurde geprueft und aktiviert |
| MGH Economy Serie | Keine Preisfrage; Knowledge-Treffer: `MGH Economy Serie` | gut; preisbereinigtes Economy-Wissen wird gefunden |
| Zahlung Custom-Auftrag | Keine Preisfrage; Knowledge-Treffer: `Zahlung bei Custom-Auftraegen`, `Zahlungsmoeglichkeiten` | gut; Zahlungslogik wird gefunden, ohne Mindestbetrag aus KnowledgeEntry |
| Custom Body/Hals/Gitarre | Keine Preisfrage; Knowledge-Treffer: `Custom-Anfragen: Bodies, Haelse und Gitarren` | gut; Custom-Rueckfragen wurden geprueft und aktiviert |
| Storno Custom-Auftrag | Keine Preisfrage; Knowledge-Treffer: `Storno bei Custom-Auftraegen` | gut; Storno-Wissen wurde aktiviert; Keywords fuer Custom-Auftrag-Schreibweisen ergaenzt |
| Internationale Antwort | Keine Preisfrage; Knowledge-Treffer: `Sprache in Kundenantworten` | gut; Sprachregeln wurden aktiviert |
| Vorlagen und Dateien | Keine Preisfrage; Knowledge-Treffer: `Vorlagen, Dateien und Templates` | gut; Vorlagen-/Dateiwissen wurde aktiviert |

## Folgeentscheidung

- Fuer Preise ist die Kontextquelle jetzt korrekt: `PriceItem`.
- Fuer Lieferzeiten/Pickguard-Ablauf existiert noch altes aktives Wissen und wird gefunden.
- Fuer Reklamationen und Custom-Rueckfragen ist das Review-Wissen jetzt aktiv.
- Fuer Storno, Sprache und Vorlagen/Templates ist das Review-Wissen jetzt aktiv.
- Das generische Keyword `custom` wurde aus dem Custom-Anfragen-Eintrag entfernt, damit Pickguard-Lieferzeitfragen nicht unnoetig Body/Hals/Gitarren-Wissen ziehen.
- Storno-Keywords wurden um Schreibweisen wie `custom auftrag` und `custom-auftrag` ergaenzt.
- Alte Preis-KnowledgeEntries bleiben deaktiviert und stehen in `docs/CLEANUP_CANDIDATES.md`.
- Preisbereinigte Eintraege fuer Versandregeln, Pickguard-Ablauf, MGH Economy und Custom-Zahlung wurden am 2026-06-17 aktiviert.
- Der Preis-Matcher wurde so nachgeschaerft, dass reine Versandkostenfragen keine unpassenden Produkt-`PriceItem`s mehr in den Prompt ziehen.
