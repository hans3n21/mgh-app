# Wissensbasis Abgleich Review

Stand: 2026-06-16

Dieses Dokument dient als Uebergabe zwischen der redaktionellen Markdown-Wissensbasis und den bestehenden `KnowledgeEntry`-Eintraegen in der Datenbank.

## Grundregel

- Quelle fuer neue redaktionelle Inhalte: `docs/wissensbasis/*.md`
- Aktueller Status aller Markdown-Dateien: `status: review`, `ki_freigabe: false`
- Deshalb beim Import nach `KnowledgeEntry`: als Review-Wissen importieren, also `isActive: false`
- Erst nach fachlicher Freigabe aktivieren (`isActive: true`)
- Keine alten aktiven Eintraege loeschen, bevor Ersatz fachlich geprueft ist
- Aktuelle Preise sollen dauerhaft aus `PriceItem` bzw. `/app/prices` kommen, nicht aus `KnowledgeEntry`
- Markdown-Preisangaben sind nur Review-Quelle zum Abgleich von `PriceItem`

## Postfaecher

| Postfach | MailAccountId | Bestehendes DB-Wissen |
|---|---|---:|
| Orders | `cmke0cuun000161ic5q4ezmzj` | 0 Eintraege |
| Dein Pickguard | `cmmepxgcl000161pglisrfl7f` | 5 aktive Eintraege, 6 inaktive Preis-Eintraege |
| MGH-Guitars | `cmmosn8tv0gv361tg7etzhem9` | 0 Eintraege |

## Bestehendes Wissen: Dein Pickguard

Diese Eintraege lagen in der echten `KnowledgeEntry`-Tabelle. Die preisartigen Eintraege wurden am 2026-06-16 deaktiviert, weil aktuelle Preise aus `PriceItem` kommen sollen.

| Titel | Kategorie | Status | Keywords | Empfehlung |
|---|---|---|---|---|
| Preis fuer XL Pickguard | `preise` | inaktiv | XL Pickguard, Preis, Versand | Durch `PriceItem` ersetzt |
| Fertigungszeit | `lieferung` | aktiv | Fertigung, Werktage, schnell | Mit `02_lieferzeiten.md` und Pickguard-Fertigungszeit aus `03_*` abgleichen |
| Customfertigungen Policy | `policies` | aktiv | Customfertigungen, Umtausch, Rueckgaberecht | Mit rechtlichem Hinweis aus `03_*` und `08_reklamation.md` abgleichen |
| Preis fuer Customfertigung | `preise` | inaktiv | Customfertigung, Preis, Porto, Verpackung, Kosten | Durch `PriceItem` ersetzt |
| Lieferung der Customfertigung | `lieferung` | aktiv | Versand, Lieferung, Fertigung, Begleitschreiben, Eckdaten | Mit `01_versandkosten.md`, `02_lieferzeiten.md`, `03_*` abgleichen |
| Preise fuer Standard Pickguard | `preise` | inaktiv | Standard, Pickguard, Preise, Tele Deluxe, Precision Bass | Durch `PriceItem` ersetzt |
| Preise fuer L Pickguard | `preise` | inaktiv | L Pickguard, Preise, Stratocaster, Jaguar, Telecaster | Durch `PriceItem` ersetzt |
| Preise fuer Trussrodcover | `preise` | inaktiv | Trussrodcover, Preise, unbedruckt, bedruckt | Durch `PriceItem` ersetzt |
| Preise fuer Backplates | `preise` | inaktiv | Backplate, Preise, gross, klein | Durch `PriceItem` ersetzt |
| Zahlungsmoeglichkeiten | `policies` | aktiv | Zahlung, PayPal, Vorkasse, Barzahlung | Mit `06_zahlung_customauftraege.md` abgleichen |
| Umtauschrichtlinien | `policies` | aktiv | Umtausch, Rueckgaberecht, Customprodukte | Mit `03_*`, `07_storno_customauftraege.md`, `08_reklamation.md` abgleichen |

## Preisabgleich Pickguards: PriceItem vs historische Review-Werte

Quelle der KI fuer aktuelle Preise soll `PriceItem` sein. Entscheidung: Preise werden nicht mehr dauerhaft aus Markdown-Preislisten oder historischen Mails gezogen. Falls eine Leistung keinen passenden `PriceItem` hat, muss ein Preiseintrag bzw. ein individuelles Angebot angelegt werden.

Die redaktionelle Datei `03_pickguards_preise_und_ablauf.md` enthaelt deshalb keine verbindliche Preistabelle mehr, sondern verweist auf `/app/prices` bzw. `PriceItem`.

Historische Review-Werte koennen zum Abgleich von `PriceItem` genutzt werden, duerfen aber nicht direkt als KI-Wissen aktiviert werden:

| Position | Historischer Review-Wert | Hinweis |
|---|---|---|
| XL Pickguard | Standard 149 EUR, Sparkle 169 EUR, Tortoise/Pearl/Special 189 EUR | gegen `PriceItem` pruefen |
| L Pickguard | Standard 89 EUR, Sparkle 110 EUR, Tortoise/Pearl/Special 149 EUR | gegen `PriceItem` pruefen |
| M Pickguard | Standard 59 EUR, Sparkle 65 EUR, Tortoise/Pearl/Special 79 EUR | gegen `PriceItem` pruefen |
| S Pickguard | Standard 38 EUR, Sparkle 40 EUR, Tortoise/Pearl/Special 49 EUR | gegen `PriceItem` pruefen |
| Trussrodcover | Unbedruckt 8 EUR, Bedruckt 22 EUR | gegen `PriceItem` pruefen |
| Backplate gross | 15 EUR | gegen `PriceItem` pruefen |
| Backplate klein | 5 EUR | gegen `PriceItem` pruefen |
| Pickuprahmen | ab 5 EUR | gegen `PriceItem` pruefen |
| Zusatzoptionen | Neue Fraesung 20 EUR, Fraesung weglassen kein Aufpreis, Shielding 15 EUR, Bedrucken einfarbig auf Anfrage, Sondermaterialien auf Anfrage, Vektorisierung 10 EUR | gegen `PriceItem` pruefen |

KnowledgeEntry sollte weiterhin den Ablauf, die Versandmarkenregel und Rueckfragen enthalten, aber keine dauerhaft verbindliche Preisliste.

## Neue Markdown-Quelle

Importstand am 2026-06-16 fuer `Dein Pickguard`: 7 nicht-preisige Markdown-Dateien wurden als Review-`KnowledgeEntry`s importiert. Davon wurden `Reklamationen`, `Custom-Anfragen`, `Storno`, `Sprache` und `Vorlagen/Dateien/Templates` geprueft und aktiviert. 4 Dateien mit Preiswarnungen wurden durch `SKIP_PRICE_REVIEW` uebersprungen.

| Datei | Thema | Import-Empfehlung |
|---|---|---|
| `00_firmendaten_und_marken.md` | Firmendaten, Marken, Tonalitaet, Werkstattkompetenz | importiert als `review:firma`, inaktiv; Kontakt-/Telefondaten weiter pruefen |
| `01_versandkosten.md` | Versandkosten und Versandregeln | `SKIP_PRICE_REVIEW`; Versandpreise/Schwellenwerte zuerst strukturieren |
| `02_lieferzeiten.md` | Lieferzeiten | importiert als `review:lieferzeiten`, inaktiv |
| `03_pickguards_preise_und_ablauf.md` | Pickguard-Preislogik, Zusatzoptionen, Ablauf, Versandmarke | preisbereinigt; konkrete Preise aus `PriceItem` |
| `04_mgh_economy_serie.md` | MGH Economy Serie | preisbereinigt; Startpreis aus `PriceItem` bzw. neuem Preiseintrag |
| `05_custom_anfragen_bodies_haelse_gitarren.md` | Custom-Anfragen fuer Bodies, Haelse, Gitarren | aktiviert als `custom-anfragen`; generisches Keyword `custom` entfernt |
| `06_zahlung_customauftraege.md` | Zahlung bei Custom-Auftraegen | Schwellenwert fuer Teilzahlung als Policy/Setting strukturieren |
| `07_storno_customauftraege.md` | Storno-Regeln | aktiviert als `storno`; Keywords fuer Custom-Auftrag-Schreibweisen ergaenzt |
| `08_reklamation.md` | Reklamationslogik | aktiviert als `reklamation` |
| `09_vorlagen_dateien_und_templates.md` | Vorlagen, Dateien, Templates | aktiviert als `dateien-vorlagen` |
| `10_sprachen.md` | Sprachregel fuer internationale Mails | aktiviert als `sprache` |

## Importbereite preisbereinigte Texte

Am 2026-06-17 wurden aus den uebersprungenen Preiswarn-Dateien zusaetzliche, preisbereinigte Quellen erstellt:

```text
docs/wissensbasis_import_ready
```

Diese Dateien veraendern die redaktionellen Originale nicht. Sie enthalten Regeln, Ablaeufe und Rueckfragen ohne konkrete Preislisten, Versandkosten oder Mindestbetraege. Die ausgelagerten Zahlen stehen als Review-Kandidaten in `docs/STRUCTURED_VALUES_REVIEW.md`.

Die vier daraus erzeugten KnowledgeEntries fuer Versandregeln, Pickguard-Ablauf, MGH Economy und Custom-Zahlung sind fuer `Dein Pickguard` aktiv. Konkrete Preise und Schwellenwerte bleiben weiterhin ausserhalb von `KnowledgeEntry`.

## Vorgeschlagene Reihenfolge

1. Preisbereinigte Quellen aus `docs/wissensbasis_import_ready` per Dry-Run pruefen.
2. Versand-/Economy-/Zahlungswerte aus `docs/STRUCTURED_VALUES_REVIEW.md` fachlich strukturieren.
3. Weitere inaktive Review-Eintraege fachlich pruefen und nur danach aktivieren.
4. Alte deaktivierte Preis-KnowledgeEntries erst nach KI-Test loeschen.
5. Entscheiden, ob Wissen kurzfristig pro Postfach dupliziert wird oder ob spaeter ein globales/shared Wissensmodell gebaut wird.

## Dry-Run Befehle

Nur lesen:

```bash
npm run knowledge:sync -- --list-accounts
npm run knowledge:sync -- --mail-account-id cmmepxgcl000161pglisrfl7f --list-existing
npm run knowledge:sync -- --mail-account-id cmmepxgcl000161pglisrfl7f
```

Import als inaktives Review-Wissen:

```bash
npm run knowledge:sync -- --mail-account-id cmmepxgcl000161pglisrfl7f --apply
```

Wichtig: Dieser Import setzt bei `status: review` und `ki_freigabe: false` automatisch `isActive: false`. Die KI nutzt diese Eintraege dann noch nicht.

## Offene Entscheidung

Aktuell ist `KnowledgeEntry` technisch pro `MailAccount`. Fachlich soll freigegebenes Wissen aber wahrscheinlich fuer alle nutzbar sein. Kurzfristig kann man Wissen in relevante Postfaecher importieren. Langfristig waere ein globales/shared Wissensmodell sauberer.
