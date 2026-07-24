# MGH App — AI-Mail-System: Cursor-Prompts

> 6 Chunks, nacheinander ausführen. Jeder Chunk ist ein eigener Cursor-Prompt.
> Stack: Next.js 15, React 19, TypeScript, Prisma, PostgreSQL, Tailwind CSS v4, NextAuth.

---

## Chunk 1: Prisma-Schema erweitern

```
Erweitere das Prisma-Schema um drei neue Modelle für das AI-Mail-System.
Jedes Postfach (Mailbox) bekommt ein eigenes AI-Profil.

### AiProfile (1:1 mit Mailbox)

- id, mailboxId (unique, relation zu Mailbox)
- tone: Enum → PROFESSIONAL, FRIENDLY, CASUAL, SHORT, EMPATHIC
- formality: Enum → DU, SIE, AUTO
- signatureName: String (Name für Grußformel)
- customInstructions: String? (Freitext, z.B. "Wir sagen immer Moin")
- businessContext: String? (Was macht der Laden, Produkte, Policies)
- generatedStyleProfile: String? (Auto-generiert aus Vorlagen — read-only für User)
- preferredModel: String default "gpt-4o-mini"
- preferredProvider: String default "openai"
- apiKey: String? (verschlüsselt — für Self-Key-Tier)
- createdAt, updatedAt

### EmailTemplate (n:1 mit Mailbox)

- id, mailboxId (relation zu Mailbox)
- key: String (z.B. "versand-info", "reklamation", "anfrage")
- name: String (Anzeigename für UI)
- subject: String? (Betreff-Vorlage)
- body: String (Mail-Text mit Platzhaltern wie {kundenname}, {bestellnr}, {produkt})
- placeholders: String[] (Liste der verwendeten Platzhalter, auto-extrahiert)
- isActive: Boolean default true
- sortOrder: Int default 0
- createdAt, updatedAt

### KnowledgeEntry (n:1 mit Mailbox)

- id, mailboxId (relation zu Mailbox)
- title: String (Anzeigename, z.B. "Hals-Preise")
- keywords: String[] (Trigger-Wörter, z.B. ["hals", "neck", "preis", "kosten"])
- content: String (Der Wissenstext der in den Prompt injiziert wird)
- category: String? (optionale Gruppierung, z.B. "preise", "lieferung")
- isActive: Boolean default true
- sortOrder: Int default 0
- createdAt, updatedAt

### Relationen

- Mailbox bekommt: aiProfile (optional 1:1), emailTemplates (1:n), knowledgeEntries (1:n)
- Unique constraint auf EmailTemplate: [mailboxId, key]

### Migration

Erstelle die Migration mit `npx prisma migrate dev --name add-ai-system`.
Füge Seed-Daten hinzu: ein AiProfile für die erste Mailbox mit tone=FRIENDLY, formality=DU.
```

---

## Chunk 2: Keyword-Matcher + Prompt-Builder Utility

```
Erstelle zwei Utility-Dateien unter src/lib/ai/:

### src/lib/ai/keyword-matcher.ts

Eine Funktion `matchKnowledgeEntries` die:
- Einen Input-Text und ein Array von KnowledgeEntry-Objekten entgegennimmt
- Den Input-Text lowercased
- Für jeden aktiven KnowledgeEntry prüft ob mindestens ein Keyword im Text vorkommt (case-insensitive, mit Wortgrenzen-Check via RegExp `\b`)
- Alle Treffer zurückgibt, sortiert nach Anzahl der Keyword-Matches (relevanteste zuerst)
- Max 5 Treffer zurückgibt (damit der Prompt nicht zu groß wird)

Signatur:
```ts
type MatchedEntry = {
  entry: KnowledgeEntry
  matchedKeywords: string[]
  matchCount: number
}

function matchKnowledgeEntries(
  inputText: string,
  entries: KnowledgeEntry[]
): MatchedEntry[]
```

### src/lib/ai/prompt-builder.ts

Eine Funktion `buildPrompt` die den kompletten Prompt zusammensetzt:

```ts
type PromptInput = {
  action: 'rewrite' | 'translate' | 'summarize' | 'cleanup' | 'template_reply'
  inputText: string           // Der Text der transformiert werden soll
  profile: AiProfile          // Stil-Profil des Postfachs
  templates?: EmailTemplate[] // Passende Vorlagen als Few-Shot
  knowledgeHits?: MatchedEntry[] // Keyword-Treffer aus der Wissensdatenbank
  targetLanguage?: string     // Für Übersetzung
  customerName?: string       // Falls bekannt
  originalMail?: string       // Die Original-Kundenmail bei Antworten
  templateKey?: string        // Welche Vorlage soll als Basis dienen
}

function buildPrompt(input: PromptInput): {
  systemPrompt: string
  userPrompt: string
}
```

Der System-Prompt wird so aufgebaut (in dieser Reihenfolge):
1. Rolle: "Du bist ein E-Mail-Assistent für [businessContext]."
2. Stil-Profil: generatedStyleProfile (falls vorhanden) ODER Fallback aus tone + formality
3. Custom Instructions (falls vorhanden)
4. Wissens-Kontext: "Nutze folgende Informationen wenn relevant:\n" + alle Knowledge-Treffer
5. Few-Shot-Vorlagen: "Orientiere dich am Stil dieser Beispiel-Mails:\n" + 2-3 Vorlagen

Der User-Prompt wird je nach Action anders aufgebaut:
- rewrite: "Formuliere folgenden Text um: [inputText]"
- translate: "Übersetze folgenden Text ins [targetLanguage], behalte den Ton bei: [inputText]"
- summarize: "Fasse zusammen: [inputText]"
- cleanup: "Mach aus diesem eingesprochenen/stichpunktartigen Text eine saubere Mail: [inputText]"
- template_reply: "Beantworte folgende Kundenmail. Nutze die Vorlage '[templateKey]' als Basis. Kundenmail: [originalMail]. Passe die Antwort an den Kunden [customerName] an."

Wichtig:
- Alle Texte in Deutsch, das ist eine deutschsprachige App
- Der Prompt soll kompakt sein, keine unnötigen Wiederholungen
- Exportiere auch eine Funktion `estimateTokenCount(text: string): number` die grob die Token-Anzahl schätzt (chars / 4)
```

---

## Chunk 3: Stil-Analyse-Funktion

```
Erstelle src/lib/ai/style-analyzer.ts

Eine Funktion die alle aktiven Vorlagen eines Postfachs nimmt und daraus
automatisch ein Stil-Profil generiert. Das wird einmalig aufgerufen wenn
Vorlagen geändert werden — nicht bei jeder Mail-Aktion.

### analyzeStyle

```ts
async function analyzeStyle(
  templates: EmailTemplate[],
  profile: AiProfile
): Promise<string>
```

- Nimmt alle aktiven Templates des Postfachs
- Baut einen Prompt: "Analysiere den Schreibstil dieser E-Mail-Vorlagen und beschreibe ihn in 5-8 prägnanten Sätzen. Achte auf: Anrede (Du/Sie), Tonalität, typische Formulierungen, Satzlänge, Formalitätsgrad, Grußformeln, besondere Sprachmerkmale."
- Hängt alle Template-Bodies als nummerierte Beispiele an
- Berücksichtigt die Ton-Einstellung aus dem Profil: "Der gewünschte Grundton ist: [tone]"
- Macht einen API-Call (nutze die Provider/Model-Einstellungen aus dem AiProfile)
- Gibt den generierten Stil-Text zurück

### API-Call Abstraktion

Erstelle auch src/lib/ai/llm-client.ts mit einer Provider-agnostischen Wrapper-Funktion:

```ts
async function callLLM(options: {
  systemPrompt: string
  userPrompt: string
  provider: string    // "openai" | "anthropic"
  model: string
  apiKey?: string     // User's own key, oder Environment-Key als Fallback
  maxTokens?: number
}): Promise<string>
```

- Unterstützt OpenAI und Anthropic API
- Nutzt den User-eigenen API-Key falls vorhanden, sonst den Server-Key aus env
- Error Handling mit sprechenden Fehlermeldungen
- Timeout nach 30 Sekunden

### Trigger

Erstelle eine Server Action oder API-Route POST /api/ai/analyze-style
- Nimmt mailboxId
- Lädt alle aktiven Templates + AiProfile
- Ruft analyzeStyle auf
- Speichert das Ergebnis in aiProfile.generatedStyleProfile
- Gibt das generierte Profil zurück
```

---

## Chunk 4: Zentrale Transform-API-Route

```
Erstelle die zentrale API-Route POST /api/ai/transform unter src/app/api/ai/transform/route.ts

Das ist der Hauptendpunkt den die UI aufruft wenn der User eine AI-Aktion triggert.

### Request Body

```ts
{
  mailboxId: string
  action: 'rewrite' | 'translate' | 'summarize' | 'cleanup' | 'template_reply'
  inputText: string
  targetLanguage?: string       // für translate
  templateKey?: string          // für template_reply
  customerName?: string         // falls bekannt
  originalMail?: string         // die Kundenmail auf die geantwortet wird
  isPreview?: boolean           // für den Settings-Preview (nutzt festen Beispieltext)
}
```

### Ablauf

1. Auth-Check (NextAuth session)
2. Lade AiProfile für die mailboxId (mit Fehler wenn keins existiert)
3. Lade aktive EmailTemplates für die mailboxId
4. Lade aktive KnowledgeEntries für die mailboxId
5. Keyword-Matching: `matchKnowledgeEntries(inputText + (originalMail || ''), knowledgeEntries)`
6. Template-Auswahl für Few-Shot:
   - Bei template_reply: die Vorlage mit dem passenden key + 1-2 weitere
   - Bei anderen Aktionen: die 2-3 Templates die zum Kontext passen (gleiche Kategorie oder random)
7. Prompt bauen: `buildPrompt({...})`
8. LLM-Call: `callLLM({...})`
9. Response: `{ result: string, tokensUsed: number, knowledgeHits: string[] }`

### Preview-Modus

Wenn `isPreview: true`:
- Nutze einen festen Beispiel-Input: "Sehr geehrte Damen und Herren, ich möchte mich nach dem Status meiner Bestellung #12345 erkundigen. Können Sie mir sagen wann die Lieferung erfolgt? Mit freundlichen Grüßen, Thomas Müller"
- Action ist immer "template_reply"
- maxTokens auf 300 begrenzen (spart Kosten)
- Keine Knowledge-Entries matchen (Preview soll nur den Stil zeigen)

### Error Handling

- 401 wenn nicht authentifiziert
- 404 wenn kein AiProfile für die Mailbox
- 400 bei fehlendem inputText oder ungültiger action
- 500 bei LLM-Fehlern (mit der Fehlermeldung vom Provider)
- 429 wenn Token-Limit erreicht (für hosted tier — prüfe gegen monatliches Limit)

### Rate Limiting

Einfaches In-Memory Rate Limiting: max 20 Calls pro Minute pro User.
```

---

## Chunk 5: Settings-UI (Postfach-Einstellungen erweitern)

```
Erweitere die bestehende Postfach-Einstellungen Komponente um die AI-Konfiguration.
Das bestehende Modal hat bereits: Tonalitäts-Buttons, System Prompt, Hintergrundwissen,
IMAP Ordner, und einen Vorlagen-Manager.

### Umbauten am bestehenden UI

1. **System Prompt Feld** → Zweigeteilt:
   - Oben: Read-only Textarea "Auto-generiertes Stil-Profil" mit dem Inhalt von
     `aiProfile.generatedStyleProfile`. Daneben ein Button "Stil neu generieren"
     der POST /api/ai/analyze-style aufruft und das Feld aktualisiert.
     Zeige einen Spinner während der Generierung.
   - Unten: Editierbare Textarea "Eigene Anweisungen" für `aiProfile.customInstructions`.
     Placeholder: "z.B. Wir sagen immer Moin statt Hallo, Preise immer netto nennen"

2. **Tonalitäts-Buttons** bleiben, steuern `aiProfile.tone`.
   Füge darunter eine Anrede-Auswahl hinzu: drei Buttons "Du" / "Sie" / "Auto"
   für `aiProfile.formality`.

3. **Hintergrundwissen** Feld → mapped auf `aiProfile.businessContext`. Bleibt wie es ist.

4. **Vorlagen-Manager** → Template-Key Feld bekommt ein Dropdown mit Vorschlägen:
   "versand", "reklamation", "anfrage", "angebot", "allgemein" (+ Freitext-Eingabe).
   Das ist der key der für die Zuordnung beim Prompt-Building genutzt wird.

### Neuer Tab/Section: "Wissen"

Unterhalb des Vorlagen-Managers (oder als eigener Tab) eine neue Section:

**Wissens-Einträge verwalten**

- Liste aller KnowledgeEntries für dieses Postfach
- Jeder Eintrag zeigt: Titel, Keywords als Tags, Aktiv/Inaktiv Toggle
- "Neuer Eintrag" Button öffnet ein Inline-Formular:
  - Titel (Input)
  - Keywords (Tag-Input: tippen + Enter fügt Tag hinzu)
  - Kategorie (optionales Dropdown: "preise", "produkte", "lieferung", "sonstiges")
  - Inhalt (Textarea, mehrzeilig)
  - Speichern / Abbrechen
- Einträge sind editierbar (Klick öffnet Edit-Modus inline)
- Löschen mit Bestätigung
- Drag & Drop für Sortierung wäre nice-to-have, aber nicht nötig für v1

### Preview-Panel

Ganz unten in den Einstellungen ein aufklappbares Panel "Vorschau":
- Zeigt einen festen Beispiel-Kundentext (hardcoded)
- Button "Vorschau generieren"
- Ruft POST /api/ai/transform mit isPreview: true auf
- Zeigt das Ergebnis in einer styled Box darunter
- Debounced: Wenn der User Einstellungen ändert und die Vorschau offen ist,
  zeige einen Hinweis "Einstellungen geändert — Vorschau aktualisieren?"
  (NICHT automatisch bei jeder Änderung feuern — spart API-Kosten)

### API-Calls

- Speichern-Button: PUT /api/mailbox/[id]/ai-profile (upsert AiProfile)
- Stil generieren: POST /api/ai/analyze-style
- Vorlagen CRUD: bestehende Endpunkte erweitern
- Wissens-Einträge CRUD: POST/PUT/DELETE /api/mailbox/[id]/knowledge
- Preview: POST /api/ai/transform mit isPreview: true

### State Management

Nutze React 19 useActionState oder useState + fetch.
Optimistic Updates für Toggle-Aktionen (Vorlage aktiv/inaktiv, Wissen aktiv/inaktiv).
```

---

## Chunk 6: AI-Aktionen in der Mail-Ansicht

```
Erstelle die UI-Komponenten die der User in der Mail-Ansicht nutzt um AI-Aktionen auszulösen.
Das sind die Buttons/Menüs die beim Lesen oder Schreiben einer Mail erscheinen.

### AI-Toolbar Komponente

Erstelle src/components/mail/AiToolbar.tsx

Eine kompakte Toolbar die über oder neben dem Mail-Editor erscheint.
Zeige sie nur wenn das aktuelle Postfach ein AiProfile hat.

Buttons (als Icon + Label, kompakt):
- ✏️ Umformulieren (action: rewrite)
- 🌐 Übersetzen (action: translate) → Klick öffnet Sprachauswahl-Dropdown (Englisch, Deutsch, Französisch, Spanisch)
- 📝 Zusammenfassen (action: summarize)
- 🧹 Text aufräumen (action: cleanup) — für eingesprochene oder stichpunktartige Texte
- 📋 Vorlage anwenden (action: template_reply) → Klick öffnet Dropdown mit aktiven Templates

### Ablauf bei Klick

1. Nimm den aktuell markierten Text im Editor (oder den gesamten Text wenn nichts markiert)
2. Wenn eine Kundenmail beantwortet wird, nimm auch die Original-Mail mit
3. Rufe POST /api/ai/transform auf mit den passenden Parametern
4. Zeige einen Loading-State im Button
5. Wenn das Ergebnis kommt: zeige es in einem Diff-View oder Replace-Dialog:
   - Links: Original-Text
   - Rechts: AI-Vorschlag
   - Buttons: "Übernehmen" (ersetzt den Text im Editor), "Verwerfen", "Nochmal" (neuer Versuch)
6. Zeige klein darunter welche Wissens-Einträge genutzt wurden (knowledgeHits aus der Response)

### Smart-Reply Komponente

Erstelle src/components/mail/SmartReply.tsx

Wird beim Beantworten einer Kundenmail angezeigt. Zeigt Vorschläge basierend auf:
- Den aktiven Templates die zum Kontext der Kundenmail passen
- Der Keyword-Analyse der Kundenmail

Ablauf:
1. Wenn der User "Antworten" klickt, analysiere die Kundenmail im Hintergrund
2. Zeige passende Vorlagen als klickbare Chips: "Mit Versand-Info antworten", "Reklamation bearbeiten"
3. Klick auf einen Chip → ruft /api/ai/transform mit action=template_reply auf
4. Ergebnis wird direkt in den Editor eingefügt (nicht als Diff, direkt als Draft)
5. User kann dann noch manuell editieren

### Keyboard Shortcuts

- Cmd/Ctrl + Shift + R → Umformulieren
- Cmd/Ctrl + Shift + T → Übersetzen (öffnet Sprachauswahl)
- Cmd/Ctrl + Shift + S → Zusammenfassen

### Styling

Nutze das bestehende Design-System der App (Tailwind CSS v4, Dark Theme).
Die Toolbar soll sich nahtlos in die bestehende Mail-Editor-UI einfügen.
Compact: Icons + kurze Labels, nicht zu viel Platz einnehmen.
Der Diff-View soll side-by-side sein auf Desktop, stacked auf Mobile.
```

---

## Reihenfolge & Abhängigkeiten

```
Chunk 1 (Schema)     → keine Abhängigkeiten, zuerst machen
Chunk 2 (Utilities)  → braucht die Prisma-Types aus Chunk 1
Chunk 3 (Stil-Analyse) → braucht llm-client aus Chunk 2
Chunk 4 (API-Route)  → braucht alles aus Chunk 2 + 3
Chunk 5 (Settings UI) → braucht API-Route aus Chunk 4
Chunk 6 (Mail-UI)    → braucht API-Route aus Chunk 4
```

Chunks 5 und 6 können parallel gemacht werden sobald Chunk 4 steht.
