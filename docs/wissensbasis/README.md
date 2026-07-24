# MGH Wissensbasis

Diese Markdown-Dateien sind als erste strukturierte Grundlage fuer Obsidian, NAS-Sync und spaetere KI-Antwortvorschlaege gedacht.

## Status-Regel

| Status | Bedeutung |
|---|---|
| `draft` | unfertig, nicht fuer KI-Antworten verwenden |
| `review` | fachlich vorbereitet, muss noch freigegeben werden |
| `approved` | darf fuer KI-Antwortvorschlaege verwendet werden |
| `deprecated` | veraltet, nicht verwenden |

## Grundsatz fuer KI-Antworten

- Nur Wissen mit `status: approved` verwenden.
- Preise immer aus der aktuellen App-Preisliste verwenden (`/app/prices` bzw. `PriceItem`).
- Wenn fuer eine Leistung kein passender Preis in der App-Preisliste vorhanden ist, keinen Preis schaetzen, sondern Rueckfrage stellen bzw. einen neuen Preiseintrag anlegen lassen.
- Alte Mailpreise und historische Markdown-Preisbeispiele duerfen nicht als aktive Preisquelle verwendet werden.
- Lieferzeiten und rechtliche Hinweise immer vorsichtig formulieren.
- Bei unvollstaendigen Angaben lieber Rueckfragen stellen als verbindlich zusagen.
- Kundendaten duerfen nur anonymisiert an externe KI-Dienste gehen.
- Zahlungsdaten duerfen nur aus einer freigegebenen zentralen Zahlungsinfo uebernommen werden.
- Bei emotionalen, aergerlichen oder angespannten Kundenmails immer deeskalierend, ruhig und loesungsorientiert antworten.
