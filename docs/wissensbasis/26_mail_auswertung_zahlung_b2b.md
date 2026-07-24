---
status: review
ki_freigabe: false
quelle: mail-auswertung
bereich: zahlung-b2b
postfaecher: [global]
letzte_pruefung: 2026-06-29
---

# Zahlung, Vorkasse, B2B und Rabatte

## Wiederkehrende Faelle

| Fall | Antwortlogik |
|---|---|
| Kunde moechte per Ueberweisung zahlen | Zahlungsdaten koennen sinnvoll genannt werden, aber nur aus zentral gepflegten CompanyData, nicht aus Mailtext. |
| Kunde hat keine Bankdaten erhalten | Rechnung/Bestellung pruefen; ggf. Zahlungsdaten bzw. Bezahllink erneut senden. |
| Custom-Auftrag | Grundsaetzlich Vorkasse bzw. Zahlung vor Fertigungsbeginn. |
| B2B-Zugang / Grosshandel | Kein klassischer Grosshandel; ihr seid Einzelhaendler. Rabatt bei groesserer Bestellsumme moeglich. |
| Gewerblicher Kunde fragt Rabatt | Zur Zeit gibt es keine feste Rabattregel. Rabatte nur individuell nach interner Freigabe. |

## Darf die KI sagen

- "Wir sind Einzelhaendler und kein klassischer Grosshandel."
- "Eine feste Rabattregel gibt es aktuell nicht; bei groesseren Anfragen pruefen wir das individuell."
- "Bei Custom-Auftraegen starten wir nach Zahlungseingang."
- "Zahlungsdaten kann ich dir gerne nennen bzw. erneut zusenden."

## Nicht sagen

- Keine IBAN oder Bankdaten aus alten Mails zitieren.
- Kein Rabattversprechen ohne interne Freigabe.
- Keinen B2B-Zugang versprechen, wenn es keinen gibt.
- Keine abweichenden Zahlungsplaene ohne interne Freigabe.

## Rabattregel

Zur Zeit gibt es keine feste Rabattregel fuer Gewerbekunden oder groessere Bestellungen. Historische Mailangaben wie "15 Prozent ab 600 EUR" sind veraltet bzw. nicht als Standard freigegeben.

## Antwortbaustein: B2B Anfrage

Hallo [Name],

wir sind Einzelhaendler und kein klassischer Grosshandel. Einen separaten B2B-Zugang bieten wir aktuell nicht an.

Eine feste Rabattregel gibt es aktuell nicht. Bei groesseren oder wiederkehrenden Anfragen koennen wir das individuell intern pruefen.

Viele Gruesse
[Mitarbeiter]

## Antwortbaustein: Zahlungsdaten fehlen

Hallo [Name],

danke fuer deine Nachricht. Wir pruefen kurz, warum die Zahlungsinformationen nicht bei dir angekommen sind, und senden dir die noetigen Daten bzw. den passenden Bezahllink erneut zu.

Viele Gruesse
[Mitarbeiter]
