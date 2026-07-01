# Cursor-Prompt: CSV-Import im Wissen-Tab + Firmendaten-System

```
Baue zwei Dinge:

## 1. Neues Prisma-Modell: CompanyData

Firmendaten die NIE zur externen KI geschickt werden — nur lokal in die
fertige Antwort eingesetzt werden per String-Replace NACH dem LLM-Call.

model CompanyData {
  id            String      @id @default(cuid())
  mailAccountId String
  mailAccount   MailAccount @relation(fields: [mailAccountId], references: [id], onDelete: Cascade)
  key           String      // z.B. "iban", "telefon", "email", "adresse", "steuernr",
                            // "signatur_de", "signatur_en", "firmenname", "website"
  label         String      // Anzeigename, z.B. "Bankverbindung (IBAN)"
  value         String      @db.Text  // Der eigentliche Wert
  isSecret      Boolean     @default(true)  // true = geht NIE in den KI-Prompt
  category      String?     // "kontakt", "bank", "signatur", "sonstiges"
  sortOrder     Int         @default(0)
  createdAt     DateTime    @default(now())
  updatedAt     DateTime    @updatedAt

  @@unique([mailAccountId, key])
  @@index([mailAccountId])
}

Relation zu MailAccount hinzufügen: companyData CompanyData[]

Migration erstellen: npx prisma migrate dev --name add-company-data

### Post-Processing Funktion

Erstelle lib/ai/post-processor.ts:

```ts
export function injectCompanyData(
  aiOutput: string,
  companyData: CompanyData[]
): string
```

- Sucht im KI-Output nach Platzhaltern im Format {firmen_key} oder {company_key}
  z.B. {firmen_iban}, {firmen_telefon}, {signatur_de}
- Ersetzt sie durch die entsprechenden CompanyData.value Einträge
- Nicht gefundene Platzhalter bleiben stehen (damit der User sieht was fehlt)
- Gibt den fertigen Text zurück

WICHTIG: Diese Funktion wird NACH dem LLM-Call aufgerufen, in der
/api/ai/transform Route. Ablauf dort wird:
1. Prompt bauen (mit Wissen, Vorlagen, Stil — aber OHNE CompanyData wo isSecret=true)
2. LLM-Call → KI-Antwort mit Platzhaltern wie {firmen_iban}
3. injectCompanyData() → finale Antwort mit echten Daten
4. Response an Frontend

Damit der LLM weiß WELCHE Platzhalter er nutzen kann, füge im System-Prompt
eine Zeile ein: "Dir stehen folgende Firmendaten-Platzhalter zur Verfügung,
nutze sie wo passend: {firmen_iban}, {firmen_telefon}, {signatur_de}, ..."
→ Nur die KEYS auflisten, nicht die Werte. So kennt die KI die Platzhalter
  aber sieht nie die echten Daten.

CompanyData-Einträge mit isSecret=false (z.B. Firmenname, Website) DÜRFEN
in den Prompt — die sind öffentlich.

### Signaturen

Signaturen sind ein Spezialfall von CompanyData:
- key: "signatur_de", "signatur_en", "signatur_kurz" etc.
- category: "signatur"
- isSecret: false (Signaturen sind nicht geheim)
- value: Der komplette Signatur-Block mit Zeilenumbrüchen

Im UI: Eigener kleiner Bereich "Signaturen" mit Textarea pro Signatur.
Alternativ kann der User auch einfach einen CompanyData-Eintrag mit
category "signatur" anlegen — gleiche Tabelle, nur andere Darstellung.


## 2. CSV-Import im Wissen-Tab

Im InboxAccountSettingsPanel.tsx, Tab "🧠 Wissen":

### Upload-Bereich

Oberhalb der bestehenden Wissens-Einträge-Liste eine Dropzone:
"📄 CSV oder Excel-Tabelle hier reinziehen"

Akzeptiert: .csv, .tsv (Excel kommt später, erstmal nur CSV/TSV)

### Verarbeitung

1. CSV parsen (nutze eine einfache Parser-Funktion, kein externes Paket nötig):
   - Erste Zeile = Spaltenköpfe
   - Delimiter auto-erkennen: Komma, Semikolon, oder Tab
   - Encoding: UTF-8 (Standard)

2. In Markdown-Tabelle umwandeln:
   ```
   | Produkt | Preis | Material |
   |---------|-------|----------|
   | Strat-Hals | 189€ | Ahorn |
   | Tele-Hals | 179€ | Esche |
   ```

3. Preview anzeigen: Die Markdown-Tabelle gerendert als HTML-Tabelle
   (einfaches Mapping, kein Markdown-Parser nötig)

4. Auto-Vorschläge generieren:
   - Titel: Dateiname ohne Extension (z.B. "preisliste-2024")
   - Keywords: Alle Spaltenköpfe als Keyword-Vorschläge + "tabelle", "liste"
   - Kategorie: "preise" wenn Spalte mit "preis"/"€"/"EUR" existiert,
     sonst "produkte" wenn "produkt"/"artikel" vorkommt, sonst "sonstiges"

5. User kann anpassen: Titel, Keywords (Tag-Input), Kategorie

6. "Speichern" → erstellt EINEN KnowledgeEntry mit:
   - content = die Markdown-Tabelle als String
   - keywords = die gewählten Keywords
   - title, category wie eingestellt

### Größen-Check

Vor dem Speichern prüfen:
- Markdown-Tabelle > 3000 Zeichen? → Warnung: "Diese Tabelle ist sehr groß
  und verbraucht viel Kontext pro KI-Anfrage. Eventuell aufteilen?"
- Markdown-Tabelle > 8000 Zeichen? → Ablehnen: "Tabelle zu groß.
  Bitte in mehrere kleinere Tabellen aufteilen."
  (8000 Zeichen ≈ 2000 Tokens, das ist die Obergrenze für einen Wissenseintrag)


## 3. Firmendaten-UI im Einstellungs-Panel

Neuer Tab im InboxAccountSettingsPanel: "🏢 Firma" (zwischen "🧠 Wissen" und "📁 Ordner")

### Layout

**Bereich "Kontakt & Bank"**
Key-Value Eingabefelder, vorbefüllt mit leeren Feldern:
- Firmenname (key: firmenname, isSecret: false)
- E-Mail (key: email_firma, isSecret: false)
- Telefon (key: telefon, isSecret: true)
- Adresse (key: adresse, isSecret: true)
- Website (key: website, isSecret: false)
- IBAN (key: iban, isSecret: true)
- Steuernummer (key: steuernr, isSecret: true)
- USt-ID (key: ustid, isSecret: false)

Jedes Feld hat ein kleines Lock-Icon wenn isSecret=true, mit Tooltip:
"Wird nie an die KI gesendet — nur lokal in Texte eingefügt"

"Weiteres Feld hinzufügen" Button für custom Key-Value Paare.

**Bereich "Signaturen"**
- Liste der Signaturen (CompanyData mit category="signatur")
- Pro Signatur: Name (z.B. "Deutsch") + Textarea für den Signatur-Block
- "Neue Signatur hinzufügen" Button
- Preview: So sieht die Signatur aus (gerendert)

### API-Routen

CRUD: /api/mail-accounts/[id]/company-data
- GET: Alle CompanyData für diesen MailAccount
- POST: Neuen Eintrag anlegen
- PUT: Eintrag aktualisieren (mit entryId im Body)
- DELETE: Eintrag löschen

Beim Speichern des ganzen Tabs: Bulk-Upsert aller Felder in einem Request.


## Zusammenfassung der Änderungen

1. Prisma: CompanyData Modell + Relation + Migration
2. lib/ai/post-processor.ts: injectCompanyData()
3. /api/ai/transform anpassen: nach LLM-Call injectCompanyData() aufrufen
4. lib/ai/prompt-builder.ts anpassen: CompanyData-Keys (nicht Values!) im
   System-Prompt auflisten + isSecret=false Werte direkt einfügen
5. InboxAccountSettingsPanel: CSV-Import im Wissen-Tab
6. InboxAccountSettingsPanel: Neuer Tab "🏢 Firma"
7. API-Routen für CompanyData CRUD

Bitte prüfe vor dem Bauen ob bereits ähnliche Mechanismen existieren
(z.B. Signatur-Felder in MailAccountProfile oder anderen Modellen).
Falls ja, wiederverwenden statt doppelt anlegen.
```
