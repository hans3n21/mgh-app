---
status: review
ki_freigabe: false
quelle: mail-auswertung
bereich: offene-fragen
postfaecher: [global]
letzte_pruefung: 2026-06-29
---

# Offene Fragen, Dubletten und Preis-Konflikte

Diese Punkte sollten vor Aktivierung oder Import in `KnowledgeEntry` geklaert werden.

## Kritische Preis-Konflikte

| Thema | Beobachtung | Empfehlung |
|---|---|---|
| Pickguard Custompreise | In den Mails kommen viele Einzelpreise vor: 89, 109, 129, 149, 169, 189 EUR usw. | Geklaert: immer aktuelle Preise aus `/app/prices` bzw. `PriceItem` verwenden. |
| Pickguard-Fertigungszeit | In einer Mail steht "max. 3 Werktage ab Eintreffen", in der aktuellen Wissensbasis 7-14 Werktage. | Aktuelle Regel beibehalten oder fachlich entscheiden, ob es Express-/Sonderfall war. |
| Versandmarke fuer Pickguard-Einsendung | Alte Mails bieten oft pauschal Versandmarke an. Aktuelle Regel: nur DE und ab 69 EUR. | Aktuelle Regel beibehalten. Alte Mails nicht pauschal uebernehmen. |
| Custom Pickup Preise | Einzelpreise 125 EUR, 145 EUR, Sonderdeals usw. | Geklaert: nur aktuelle Preise aus `/app/prices` bzw. `PriceItem`. |
| Custom Hals Preise | Alte Mails nennen 350, 350-380, 450, 520, 550 EUR je nach Fall. | Geklaert: nur aus Konfigurator/Preisliste; wenn nicht vorhanden, Preiseintrag/Angebot anlegen. |
| Lackpreise | Alte Mails nennen z. B. 600/850 EUR fuer komplette Nitro-Lackierung. | Geklaert: nur aus aktueller Preisliste. |
| B2B Rabatt | Mail nennt 15 Prozent ab 600 EUR und versandkostenfrei. | Geklaert: zur Zeit keine feste Rabattregel. |

## Inhalte, die technisch bestaetigt werden sollten

| Thema | Frage |
|---|---|
| MGH-7 Farbcode | Geklaert: Farbcode ist korrekt und in `24_mail_auswertung_pickups_support.md` ergaenzt. |
| MGH-16 P-Bucker | Geklaert: Dummyspule 4,5 kOhm und Mini-P90-Spule 9,8 kOhm sind fixe Werte. |
| P-Bucker Magnetoptionen | Geklaert: Alnico 2,3,4,5,6,8,9 sind lagernd/waehlbar. |
| P90 im Humbuckerformat | Darf die Formulierung "naeher am P90, aber heller/nicht 1:1" allgemein gelten? |
| Rahmen/Cover Kompatibilitaet | Sollen konkrete Shoplinks/Artikelnummern als Wissen importiert werden oder immer live aus Shop/Preisliste? |

## Prozessfragen

1. Geklaert: Globales Wissen kann in der Wissensbasis liegen und spaeter fuer alle relevanten Postfaecher nutzbar sein.
2. Geklaert: Preise sollen direkt aus `PriceItem` kommen, statt als `KnowledgeEntry` dupliziert zu werden. Wenn kein passender Preiseintrag existiert, muss einer angelegt bzw. ein individuelles Angebot erstellt werden.
3. Geklaert: Die KI soll bei Retoure/Falschlieferung unterscheiden:
   - Fehler bei uns: Retourlabel/Porto/Nachlieferung
   - kein Fehler bei uns: Kunde traegt Ruecksendung
4. Geklaert: Die KI soll bei emotionalen/angespannten Mails immer deeskalierend formulieren.
5. Geklaert: Zur Zeit keine feste Rabattregel.

## Dubletten / zusammenfuehren

- Briefversand ablehnen: existiert bereits in `01_versandkosten.md`; Mailauswertung bestaetigt die Regel.
- Custom-Pickguard Ablauf: existiert bereits in `03_pickguards_preise_und_ablauf.md`; Mailauswertung bestaetigt Ablauf, aber alte Preise sind uneinheitlich.
- Custom vom Umtausch ausgeschlossen: existiert bereits in mehreren Dateien; sollte zentral gepflegt werden.
- Reklamation/Fotos anfordern: existiert bereits in `08_reklamation.md`; Mailauswertung ergaenzt Falschlieferungslogik.
- Zahlung/Vorkasse: existiert bereits in `06_zahlung_customauftraege.md`; Mailauswertung ergaenzt B2B/Zahlungsdaten fehlen.
