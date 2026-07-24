# Structured Values Review

Stand: 2026-06-17

Diese Datei sammelt Zahlen aus der redaktionellen Wissensbasis, die nicht dauerhaft in `KnowledgeEntry` stehen sollten.

## Grundregel

- `PriceItem` bleibt Quelle fuer aktuelle Preise.
- `KnowledgeEntry` bleibt Quelle fuer Regeln, Ablaeufe, Rueckfragen und Formulierungslogik.
- Werte in dieser Datei sind Review-Kandidaten, keine automatisch freigegebenen KI-Wahrheiten.

## Bereits strukturiert in PriceItem

| Bereich | Quelle | Status |
|---|---|---|
| Pickguard-Groessenpreise | `docs/wissensbasis/03_pickguards_preise_und_ablauf.md` | In `PriceItem` abgeglichen |
| Trussrodcover | `docs/wissensbasis/03_pickguards_preise_und_ablauf.md` | In `PriceItem` abgeglichen |
| Backplates und Pickuprahmen | `docs/wissensbasis/03_pickguards_preise_und_ablauf.md` | In `PriceItem` abgeglichen |
| Pickguard-Zusatzoptionen | `docs/wissensbasis/03_pickguards_preise_und_ablauf.md` | In `PriceItem` angelegt |

## Noch zu strukturieren

| Bereich | Werttyp | Quelle | Vorschlag |
|---|---|---|---|
| Versandkosten | Zonen, Kosten, Freigrenzen, Gitarrenversand | `docs/wissensbasis/01_versandkosten.md` | Eigene strukturierte Shipping-Settings oder ShippingPriceItem-Modell |
| Pickguard Versandmarke | Mindestauftragswert und Laenderregel | `docs/wissensbasis/03_pickguards_preise_und_ablauf.md` | SystemSetting oder explizites Policy-Modell |
| MGH Economy Serie | Einstiegspreis | `docs/wissensbasis/04_mgh_economy_serie.md` | PriceItem unter `MGH Guitars`; wenn nicht vorhanden, neuen Preiseintrag anlegen |
| Custom-Zahlung | Mindestbetrag fuer Teilzahlung | `docs/wissensbasis/06_zahlung_customauftraege.md` | SystemSetting oder PaymentPolicy-Modell |

## Importbereite Regeltexte

Preisbereinigte KnowledgeEntry-Quellen liegen unter:

```text
docs/wissensbasis_import_ready
```

Diese Dateien enthalten bewusst keine konkreten Preislisten, Versandkosten oder Mindestbetraege.
