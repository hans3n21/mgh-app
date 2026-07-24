# MGH App — AI-Mail-System: Cursor-Prompts (v2 — bereinigt)

> Basiert auf Bestandsaufnahme vom 16.03.2026.
> Nur das was FEHLT — kein Doppelt-Bauen.
> Stack: Next.js 15, React 19, TypeScript, Prisma, PostgreSQL, Tailwind CSS v4, NextAuth.

---

## Was bereits existiert (NICHT nochmal bauen)

- **Prisma-Schema**: AiProfile, EmailTemplate, KnowledgeEntry — komplett vorhanden
- **PII-System**: lib/pii/anonymize.ts + lib/pii/tokenizer.ts + lib/mail/extraction.ts
  → Regex + DB-Matching, tokenizePII(), rehydratePII(), AnonymizeResult Interface
  → Erkennt: email, phone, iban, address, postalCode, name, customerNumber
  → Platzhalter-Format: {{NAME_1}}, {{EMAIL_1}} etc.
- **LLM-Client**: lib/ai/llm-client.ts (callLLM mit OpenAI + Anthropic)
- **API-Routen**: /api/ai/transform, /api/ai/analyze-style, CRUD für email-templates + knowledge
- **Settings-UI**: InboxAccountSettingsPanel.tsx mit Tabs (KI, Vorlagen, Wissen, Ordner)
- **Rate-Limiting**: In-Memory, 20/min pro User in transform-Route

---

## Chunk A: Keyword-Matcher + Prompt-Builder prüfen/vervollständigen

```
Prüfe ob folgende Dateien existieren und vollständig implementiert sind:
- lib/ai/keyword-matcher.ts
- lib/ai/prompt-builder.ts

Falls sie NICHT existieren oder unvollständig sind, erstelle/vervollständige sie:

### lib/ai/keyword-matcher.ts

Prüfe ob eine Funktion existiert die KnowledgeEntry-Keywords gegen einen
Input-Text matcht. Falls nicht, erstelle:

```ts
import { KnowledgeEntry } from '@prisma/client'

export type MatchedEntry = {
  entry: KnowledgeEntry
  matchedKeywords: string[]
  matchCount: number
}

export function matchKnowledgeEntries(
  inputText: string,
  entries: KnowledgeEntry[]
): MatchedEntry[]
```

- Input-Text lowercasen
- Nur aktive Entries (isActive === true) berücksichtigen
- Für jedes Keyword: RegExp mit \b Word-Boundary (case-insensitive)
- Treffer sortiert nach matchCount (höchste zuerst)
- Max 5 Treffer zurückgeben
- Deutsche Umlaute beachten: \b funktioniert nicht perfekt mit ä/ö/ü,
  deshalb zusätzlich einfaches includes() als Fallback

### lib/ai/prompt-builder.ts

Prüfe ob eine Funktion existiert die den kompletten Prompt für einen
AI-Call zusammensetzt. Falls nicht, erstelle:

```ts
export type PromptAction = 'rewrite' | 'translate' | 'summarize' | 'cleanup' | 'template_reply'

export type PromptInput = {
  action: PromptAction
  inputText: string
  profile: AiProfile
  mailAccountProfile?: MailAccountProfile  // Legacy-Felder aiSystemPrompt, backgroundInfo
  templates?: EmailTemplate[]
  knowledgeHits?: MatchedEntry[]
  targetLanguage?: string
  customerName?: string
  originalMail?: string
  templateKey?: string
}

export function buildPrompt(input: PromptInput): {
  systemPrompt: string
  userPrompt: string
}
```

WICHTIG: Der System-Prompt muss BEIDE Quellen berücksichtigen:
- AiProfile: generatedStyleProfile, customInstructions, businessContext, tone, formality
- MailAccountProfile (Legacy): aiSystemPrompt, backgroundInfo
Priorisierung: AiProfile-Felder gewinnen, Legacy-Felder als Fallback wenn
AiProfile-Felder leer sind.

System-Prompt Aufbau (in dieser Reihenfolge):
1. Rolle + businessContext (oder backgroundInfo als Fallback)
2. generatedStyleProfile ODER Fallback aus tone + formality als Text
3. customInstructions (oder aiSystemPrompt als Fallback)
4. Wissens-Kontext aus knowledgeHits (wenn vorhanden)
5. Few-Shot Vorlagen (wenn vorhanden)

User-Prompt je nach Action — alles auf Deutsch:
- rewrite: "Formuliere folgenden Text um: ..."
- translate: "Übersetze ins [targetLanguage], behalte den Ton bei: ..."
- summarize: "Fasse zusammen: ..."
- cleanup: "Mach aus diesem Text eine saubere Mail: ..."
- template_reply: "Beantworte diese Kundenmail mit der Vorlage '[templateKey]': ..."

Prüfe auch ob die bestehende /api/ai/transform Route den Prompt-Builder
und Keyword-Matcher bereits nutzt. Falls nicht, verdrahte sie.
```

---

## Chunk B: Mail-Verarbeitungs-Pipeline (Kernstück)

```
Erstelle die zentrale Pipeline die eine rohe Mail automatisch verarbeitet.
Sie wird sowohl vom Onboarding als auch vom "Mail als Vorlage speichern" genutzt.

WICHTIG: Nutze das BESTEHENDE PII-System! Nicht neu bauen!
- lib/pii/anonymize.ts → anonymize() / AnonymizeResult
- lib/pii/tokenizer.ts → tokenizePII() / rehydratePII()
- lib/mail/extraction.ts → extractEntities() / ExtractedEntity

### lib/ai/mail-processor.ts

```ts
import { anonymize } from '@/lib/pii/anonymize'
import { callLLM } from '@/lib/ai/llm-client'
import type { EmailTemplate, KnowledgeEntry, AiProfile } from '@prisma/client'

export type ProcessedMail = {
  // Anonymisierung (aus bestehendem PII-System)
  anonymizedText: string
  tokenMap: Record<string, string>  // Platzhalter → Originalwert
  hadPII: boolean

  // KI-extrahierte Vorlage
  suggestedTemplate: {
    key: string
    name: string
    subject: string
    body: string          // Text mit {{PLATZHALTERN}} aus PII-System
    placeholders: string[]
  } | null

  // KI-extrahiertes Wissen
  suggestedKnowledge: Array<{
    title: string
    keywords: string[]
    content: string
    category: string
  }>

  // Stil-Update
  styleRelevant: boolean  // Hat die Mail genug Substanz für Stil-Update?
}

export async function processMailForTraining(
  rawMailText: string,
  profile: AiProfile,
  existingTemplateKeys: string[],
  existingKnowledgeTitles: string[]
): Promise<ProcessedMail>
```

Ablauf:
1. Rufe das bestehende anonymize() auf → gibt anonymizedText + tokenMap zurück
   Prüfe die genaue Signatur von anonymize() und passe den Aufruf an.
   Falls anonymize() zusätzliche Parameter braucht (z.B. Entities), nutze
   vorher extractEntities() aus lib/mail/extraction.ts.

2. EIN LLM-Call mit dem anonymisierten Text:

Prompt:
"Du bekommst eine anonymisierte geschäftliche E-Mail (PII bereits durch
Platzhalter wie {{NAME_1}}, {{EMAIL_1}} ersetzt).

AUFGABE 1 — VORLAGE:
Erstelle eine wiederverwendbare Mail-Vorlage daraus.
- Vergib einen kurzen key (kebab-case, z.B. 'versand-info')
- Vergib einen lesbaren deutschen Namen
- Behalte alle {{PLATZHALTER}} bei
- Bereits existierende Template-Keys: [existingTemplateKeys]
  → Wähle einen Key der NICHT in dieser Liste ist

AUFGABE 2 — WISSEN:
Extrahiere faktische Informationen (Preise, Produkte, Lieferzeiten,
Policies, Slogans) als Wissens-Einträge.
- Pro Eintrag: title, keywords (3-6 deutsche Trigger-Wörter), content, category
- Kategorien: preise | produkte | lieferung | policies | sonstiges
- NICHT extrahieren wenn der Titel schon existiert: [existingKnowledgeTitles]
- Keine PII als Wissen speichern

AUFGABE 3 — STIL-RELEVANZ:
Ist diese Mail lang/substanziell genug um den Schreibstil zu analysieren?
(Mindestens 3 Sätze eigener Text, nicht nur Grußformel)

Antwortformat: Nur JSON, kein Markdown.
{
  \"template\": { \"key\": \"...\", \"name\": \"...\", \"subject\": \"...\", \"body\": \"...\", \"placeholders\": [...] } oder null,
  \"knowledge\": [{ \"title\": \"...\", \"keywords\": [...], \"content\": \"...\", \"category\": \"...\" }],
  \"styleRelevant\": true/false
}"

3. JSON parsen (mit try/catch + Fallback)
4. Template-Key Kollisions-Check: wenn der Key schon existiert, Suffix anhängen
5. ProcessedMail zusammenbauen und zurückgeben

### lib/ai/batch-processor.ts

Für das Onboarding (mehrere Mails auf einmal):

```ts
export async function processMailBatch(
  mails: string[],
  profile: AiProfile,
  existingTemplateKeys: string[],
  existingKnowledgeTitles: string[]
): Promise<{
  results: ProcessedMail[]
  deduplicatedKnowledge: ProcessedMail['suggestedKnowledge']
}>
```

- Verarbeitet jede Mail sequentiell durch processMailForTraining
- Aktualisiert existingTemplateKeys nach jeder Mail (damit keine Duplikate)
- Dedupliziert Knowledge: wenn zwei Mails einen Eintrag mit >50% Keyword-Overlap
  generieren → den längeren content behalten
- Gibt alles gebündelt zurück

### API-Routen

POST /api/ai/process-mail
- Body: { mailAccountId: string, rawMailText: string }
- Auth-Check (NextAuth Session)
- Lädt AiProfile, existierende Template-Keys und Knowledge-Titel
- Ruft processMailForTraining() auf
- Gibt ProcessedMail zurück (NICHT gespeichert — User muss reviewen)

POST /api/ai/process-mail-batch
- Body: { mailAccountId: string, mails: string[] }
- Gleiche Logik, ruft processMailBatch() auf
- Max 15 Mails pro Batch

POST /api/ai/confirm-processed
- Body: {
    mailAccountId: string,
    templates: Array<{ key, name, subject, body, placeholders }>,
    knowledge: Array<{ title, keywords, content, category }>,
    updateStyle: boolean
  }
- Speichert bestätigte Templates via Prisma emailTemplate.createMany()
- Speichert bestätigte Knowledge via Prisma knowledgeEntry.createMany()
- Wenn updateStyle: true → ruft /api/ai/analyze-style intern auf
- Gibt { savedTemplates: number, savedKnowledge: number } zurück
```

---

## Chunk C: Onboarding-Wizard UI

```
Erstelle den AI-Onboarding-Wizard als Modal-Komponente.

WICHTIG: Nutze das bestehende Design-System und die bestehenden Komponenten.
Schau dir InboxAccountSettingsPanel.tsx an für Styling-Referenz.

### components/onboarding/AiOnboardingWizard.tsx

Ein Modal (oder Fullscreen-Overlay) mit 4 Schritten.
Progress-Bar oben zeigt den aktuellen Schritt.

**Einstiegspunkte (beide müssen funktionieren):**
1. Automatisch: Wenn ein MailAccount noch KEIN AiProfile hat und der User
   den Posteingang öffnet → dezenter Banner oben: "KI einrichten →"
   (KEIN aufdringliches Auto-Popup)
2. Manuell: Button "🤖 KI-Onboarding" in den Postfach-Einstellungen (Tab ✨ KI),
   platziert oberhalb der bestehenden Tonalitäts-Buttons

**Schritt 1: "Dein Business"**
- Textarea: "Was macht dein Laden?" → wird zu aiProfile.businessContext
- URL-Feld: "Website-URL (optional)" → wird im nächsten Chunk verarbeitet
  (für jetzt nur speichern, nicht crawlen)
- Anrede: Zwei Buttons "Du" / "Sie" → aiProfile.formality
- Ton: Die 5 bestehenden Buttons (Professionell, Freundlich, Locker, Kurz, Empathisch)
  → aiProfile.tone. Nutze EXAKT dieselbe Komponente/Logik wie im Settings-Tab.
- "Weiter" Button

**Schritt 2: "Mails einspeisen"**
- Große Dropzone (dashed border, zentrierter Text):
  "Ziehe hier gesendete Mails rein oder füge Text ein"
  "Mindestens 3 Mails empfohlen — je mehr, desto besser lernt die KI deinen Stil"
- Akzeptiert: Copy-Paste in Textarea ODER Datei-Drop (.eml, .txt)
  Für .eml: extrahiere den Body-Text (plain text part)
- Zeigt eingefügte Mails als nummerierte Liste mit Preview (erste 80 Zeichen)
  und "✕ entfernen" Button pro Eintrag
- Counter: "4 von mindestens 3 Mails ✓"
- Button "KI analysieren lassen" (disabled wenn < 1 Mail)
  → ruft POST /api/ai/process-mail-batch auf
  → Loading-State: "Verarbeite Mail 2 von 5..."

**Schritt 3: "Ergebnisse prüfen"**
Drei aufklappbare Sections:

Section A — "Schreibstil" (wenn styleRelevant bei mindestens einer Mail):
- Zeigt den generierten Style-Text in einer Read-Only Box
- Buttons: "Passt ✓" / "Anpassen" (öffnet Edit-Textarea)

Section B — "Vorlagen" (X Stück):
- Jede Vorlage als Card mit: Name, Key als Badge, Body-Preview (3 Zeilen)
- PII-Platzhalter farbig hervorgehoben ({{NAME_1}} orange, {{EMAIL_1}} rot etc.)
  Nutze eine kleine Mapping-Funktion: Platzhalter-Typ → Tailwind-Farbe
- Pro Card: Buttons "✓ Übernehmen" / "✗ Verwerfen" / "✎ Bearbeiten"
- Bearbeiten öffnet Inline-Edit mit Key, Name, Body Feldern

Section C — "Wissen" (X Einträge):
- Jeder Eintrag als kompakte Zeile: Titel | Keywords als farbige Tags | Kategorie-Badge
- Pro Zeile: "✓" / "✗" / "✎"
- Bearbeiten: Inline-Edit für Titel, Keywords (Tag-Input), Content (Textarea)

Button "Auswahl speichern" → POST /api/ai/confirm-processed
→ Nur die mit "✓" markierten Items werden gesendet

**Schritt 4: "Live-Test"**
- KI generiert 3 Beispiel-Kundenanfragen:
  Dafür ein LLM-Call: "Erstelle 3 realistische Kundenanfragen für ein Unternehmen
  das [businessContext]. Verschiedene Typen: Preisanfrage, Reklamation, allgemeine Frage.
  Format: JSON Array mit 3 Strings."
- Für jede Anfrage: zeige die Anfrage + die KI-generierte Antwort
  (nutze /api/ai/transform mit action=template_reply)
- User bewertet pro Antwort: 👍 / 👎
- Bei 👎: Textarea "Was war falsch?" → Text wird als Ergänzung an
  aiProfile.customInstructions angehängt
- Ergebnis:
  - 2-3 👍 → "Deine KI ist bereit! 🎉" + Button "Zur Inbox"
  - 0-1 👍 → "Lass uns nachbessern" + Button "Zurück zu Schritt 3" +
    Hinweis "Du kannst jederzeit mehr Mails einspeisen"

### State-Management

Nutze React useState für den Wizard-State:
- currentStep (1-4)
- businessContext, websiteUrl, formality, tone (Schritt 1)
- inputMails: string[] (Schritt 2)
- processedResults: vom Batch-API zurück (Schritt 2→3)
- reviewState: Map von item-ids zu 'accept' | 'reject' | 'edit' (Schritt 3)
- testResults: Array von { question, answer, rating } (Schritt 4)

### Styling-Hinweise

- Dark Theme: Orientiere dich am InboxAccountSettingsPanel
- Modal: max-w-2xl, zentriert, mit Backdrop
- Progress: 4 Kreise verbunden mit Linie, aktiver Kreis highlighted
- Dropzone: border-dashed, beim Hover border-solid + leichter Background-Change
- Cards: border border-[var(--border-color)] mit hover:border-[var(--accent)]
```

---

## Chunk D: Vorlagen-Manager Drop-Handler + Pipeline-Integration

```
Der Vorlagen-Manager in InboxAccountSettingsPanel.tsx hat aktuell eine
Drag-Source in InboxPreview.tsx (Button "📥 Als Vorlage ziehen"), aber
KEINEN aktiven Drop-Handler. Erstelle diesen und verdrahte ihn mit der
Mail-Verarbeitungs-Pipeline.

### 1. Drop-Handler im Vorlagen-Manager

In InboxAccountSettingsPanel.tsx, im Templates-Tab:
Finde den Bereich wo Vorlagen verwaltet werden (Tab 'templates').
Die Dropzone dort (gestrichelter Bereich "Mail-Text hier hineinziehen")
braucht funktionale onDragOver/onDrop Handler.

```tsx
// Im templates-Tab Bereich:
const [isProcessing, setIsProcessing] = useState(false)
const [processedResult, setProcessedResult] = useState<ProcessedMail | null>(null)

const handleMailDrop = async (e: React.DragEvent) => {
  e.preventDefault()
  const rawText = e.dataTransfer.getData('text/plain')
  if (!rawText?.trim()) return

  setIsProcessing(true)
  try {
    const res = await fetch('/api/ai/process-mail', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ mailAccountId, rawMailText: rawText })
    })
    const data = await res.json()
    setProcessedResult(data)  // Zeigt Review-UI
  } finally {
    setIsProcessing(false)
  }
}
```

### 2. Inline-Review nach Drop

Wenn processedResult gesetzt ist, zeige STATT des normalen Template-Formulars
eine Review-Ansicht:

- Oben: "KI hat folgendes aus der Mail extrahiert:"
- Vorlagen-Preview mit PII-Platzhaltern farbig markiert
  → Key, Name, Body editierbar
- Darunter: "Auch als Wissen erkannt:" (falls suggestedKnowledge nicht leer)
  → Zeige Einträge als kompakte Chips/Tags
  → Toggle pro Eintrag: "Mit speichern? ✓/✗"
- Buttons: "Alles übernehmen" / "Nur Vorlage" / "Verwerfen"

"Alles übernehmen" → POST /api/ai/confirm-processed mit templates + knowledge
"Nur Vorlage" → POST nur mit templates, leeres knowledge Array
"Verwerfen" → setProcessedResult(null), zurück zum normalen Formular

### 3. Loading-State

Während isProcessing:
- Dropzone zeigt Spinner + "KI analysiert die Mail..."
- Template-Formular ist disabled

### 4. Fallback: Manuelles Speichern bleibt

Das bestehende manuelle Formular (Template-Key + Template-Body + "Vorlage anlegen")
bleibt NEBEN dem Drag-Drop bestehen. Nicht entfernen.
User die keine KI nutzen wollen können weiterhin manuell Vorlagen anlegen.

### 5. Onboarding-Button im KI-Tab

Im Tab '✨ KI' in InboxAccountSettingsPanel.tsx:
Füge ganz oben einen Button ein:

```tsx
<button
  onClick={() => setShowOnboardingWizard(true)}
  className="w-full mb-4 py-2 px-4 border border-dashed rounded-lg
             text-sm text-muted hover:text-primary hover:border-primary
             transition-colors"
>
  🤖 KI-Onboarding durchführen (Mails einspeisen, Stil lernen, Wissen aufbauen)
</button>
```

Wenn aiProfile noch nicht existiert (kein generatedStyleProfile),
zeige stattdessen einen prominenteren CTA:
"Du hast die KI noch nicht eingerichtet — jetzt in 3 Minuten starten →"

Das AiOnboardingWizard Modal öffnet sich über setShowOnboardingWizard(true).
```

---

## Chunk E: AI-Toolbar in der Mail-Ansicht (nur falls noch nicht vorhanden)

```
PRÜFE ZUERST ob es bereits eine AI-Toolbar oder AI-Aktions-Buttons in der
Mail-Compose/Reply-Ansicht gibt. Suche nach:
- Komponenten mit "AiToolbar", "AiActions", "SmartReply" im Namen
- Buttons die /api/ai/transform aufrufen in der Mail-Editor-Umgebung
- Keyboard-Shortcuts für AI-Aktionen

Falls bereits vorhanden: Prüfe ob der Keyword-Matcher integriert ist.
Die transform-Route sollte:
1. KnowledgeEntries laden
2. matchKnowledgeEntries() gegen inputText + originalMail laufen lassen
3. Treffer in den Prompt packen via buildPrompt()
4. In der Response zurückgeben welche Knowledge-Entries genutzt wurden

Falls noch NICHT vorhanden, erstelle:

### components/mail/AiToolbar.tsx

Kompakte Toolbar über oder neben dem Mail-Editor.
Nur sichtbar wenn das Postfach ein AiProfile hat.

Buttons (Icon + kurzes Label):
- ✏️ Umformulieren → action: rewrite
- 🌐 Übersetzen → Klick öffnet kleines Dropdown: DE, EN, FR, ES, CZ
- 📝 Zusammenfassen → action: summarize
- 🧹 Aufräumen → action: cleanup
- 📋 Vorlage → Klick öffnet Dropdown mit aktiven EmailTemplates des Postfachs

Bei Klick:
1. Markierten Text nehmen (oder ganzen Editor-Inhalt wenn nichts markiert)
2. POST /api/ai/transform
3. Loading im Button
4. Ergebnis in Split-View: Links Original, Rechts KI-Vorschlag
5. Buttons: "Übernehmen" (ersetzt im Editor) / "Verwerfen" / "Nochmal"
6. Klein darunter: "Genutztes Wissen: Hals-Preise, Lieferzeiten" (die knowledgeHits)

### Smart-Reply Chips (beim Antworten)

Wenn der User auf "Antworten" klickt:
1. Lade die aktiven EmailTemplates des Postfachs
2. Lade KnowledgeEntries und matche gegen die Kundenmail
3. Zeige passende Vorlagen als klickbare Chips oberhalb des Editors:
   "💬 Versandinfo senden" | "💬 Reklamation bearbeiten" | "💬 Preisanfrage beantworten"
4. Klick auf Chip → /api/ai/transform mit action=template_reply + templateKey
5. Ergebnis direkt in den Editor (kein Diff-View, direkt als Draft)
```

---

## Reihenfolge

```
1. Chunk A  — Keyword-Matcher + Prompt-Builder prüfen/erstellen
             (Voraussetzung für alles andere)

2. Chunk B  — Mail-Verarbeitungs-Pipeline
             (braucht: bestehendes PII-System + llm-client + ggf. Chunk A)

3. Chunk C  — Onboarding-Wizard UI
             (braucht: API-Routen aus Chunk B)

4. Chunk D  — Drop-Handler + Pipeline-Integration + Onboarding-Button
             (braucht: Pipeline aus Chunk B + Wizard aus Chunk C)

5. Chunk E  — AI-Toolbar (nur falls nötig)
             (braucht: Chunk A für Keyword-Matching im Transform)
```
