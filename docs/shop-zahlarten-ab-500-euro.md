# Zahlarten: ab 500 € nur noch Überweisung

Ziel: Bei Werkstattaufträgen ab **500,00 € brutto** (inkl. Versand) soll der Kunde
nur noch per Direktüberweisung bezahlen können — PayPal-Gebühren fressen bei
großen Beträgen zu viel weg. Darunter bleiben alle Zahlarten offen.

## Wie es funktioniert

Es reicht, beim Anlegen der WooCommerce-Bestellung das Feld `payment_method`
zu setzen. Auf der „Für Bestellung bezahlen"-Seite wirkt das als **Vorgabe**:

| `payment_method` | Anzeige im Backend | Was der Kunde sieht |
|---|---|---|
| `''` (leer) | `n. v.` | alle aktiven Zahlarten, er wählt selbst |
| `'bacs'` | Direkte Banküberweisung | nur Direktüberweisung |

Ein zusätzliches Plugin oder ein PHP-Filter im Shop ist **nicht** nötig.

## Umsetzung in der App

`lib/woocommerce.ts` → `createWooOrderForInternal()` belegt die Zahlungsart
abhängig vom Bruttobetrag (Endbetrag + Versand) vor:

```ts
const bankTransferOnly = grossTotalCents >= BANK_TRANSFER_ONLY_FROM_CENTS;
payment_method: bankTransferOnly ? 'bacs' : '',
```

Schwellwert: `BANK_TRANSFER_ONLY_FROM_CENTS` = 50000 Cent (500,00 €, inklusive).
Der Versand zählt mit — 495 € Auftrag + 6,95 € Versand liegt also drüber.
Bei Extra-Bestellungen (`customLabel`) wird kein Versand berechnet und
entsprechend auch nicht mitgezählt.

## Wie das geprüft wurde (2026-08-25)

Zwei Testbestellungen aus `ORD-2026-070` im Live-Shop angelegt und die
Bezahlseite jeweils eingeloggt aufgerufen:

- **#30401** (149,00 €, `payment_method=''`) → alle Zahlarten wurden angeboten
- **#30402** (600,00 €, `payment_method='bacs'`) → nur Direktüberweisung

Beide Testbestellungen wurden danach in den Papierkorb verschoben.

> Hinweis für später: Die Bezahlseite lässt sich **nicht** anonym aufrufen —
> der Shop verlangt vorher Login oder E-Mail-Verifizierung. Zum Nachprüfen also
> im eingeloggten Browser öffnen.

## Aktive Zahlarten im Shop (Stand 2026-08-25)

| ID | Titel |
|---|---|
| `bacs` | Direkte Banküberweisung |
| `ppcp-gateway` | PayPal |
| `ppcp-googlepay` | Google Pay |
| `ppcp-card-button-gateway` | Debit- und Kreditkarten |
| `german_market_purchase_on_account` | Bezahlung vor Ort |

## Grenze ändern

Nur `BANK_TRANSFER_ONLY_FROM_CENTS` in `lib/woocommerce.ts` anpassen.
Soll ab 500 € zusätzlich „Bezahlung vor Ort" möglich sein (kostet ebenfalls
keine Gebühren), geht das über dieses Feld **nicht** — es nimmt nur eine
einzelne Zahlart. Dann wäre doch ein Filter im Shop nötig.
