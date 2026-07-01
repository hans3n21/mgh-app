import { extractEntities } from '@/lib/mail/extraction'
import { tokenizePII } from '@/lib/pii/tokenizer'
import { callLLM, getGlobalAiDefaults } from '@/lib/ai/llm-client'
import type { AiProfile } from '@prisma/client'

export type SuggestedTemplate = {
  key: string
  name: string
  subject: string
  body: string
  placeholders: string[]
}

export type SuggestedKnowledgeEntry = {
  title: string
  keywords: string[]
  content: string
  category: string
}

export type ProcessedMail = {
  anonymizedText: string
  tokenMap: Record<string, string>
  hadPII: boolean
  suggestedTemplate: SuggestedTemplate | null
  suggestedKnowledge: SuggestedKnowledgeEntry[]
  styleRelevant: boolean
}

type LLMResponse = {
  template: SuggestedTemplate | null
  knowledge: SuggestedKnowledgeEntry[]
  styleRelevant: boolean
}

export async function processMailForTraining(
  rawMailText: string,
  profile: AiProfile,
  existingTemplateKeys: string[],
  existingKnowledgeTitles: string[]
): Promise<ProcessedMail> {
  // 1. PII-Anonymisierung direkt auf dem Raw-Text (kein mailId vorhanden)
  const entities = await extractEntities(rawMailText)
  const piiEntities = entities.filter(e => e.pii)

  let anonymizedText = rawMailText
  let tokenMap: Record<string, string> = {}

  if (piiEntities.length > 0) {
    const result = tokenizePII(rawMailText, entities)
    anonymizedText = result.tokenizedText
    tokenMap = result.tokenMap
  }

  const hadPII = Object.keys(tokenMap).length > 0

  // 2. Ein LLM-Call mit dem anonymisierten Text
  const existingKeysHint = existingTemplateKeys.length > 0
    ? `Bereits existierende Template-Keys (NICHT verwenden): ${existingTemplateKeys.join(', ')}`
    : ''

  const existingTitlesHint = existingKnowledgeTitles.length > 0
    ? `Nicht extrahieren wenn der Titel schon existiert: ${existingKnowledgeTitles.join(', ')}`
    : ''

  const systemPrompt =
    'Du bist ein KI-Assistent der geschäftliche E-Mails analysiert. ' +
    'Antworte ausschließlich mit validem JSON ohne Markdown-Blöcke.'

  const userPrompt =
    `Du bekommst eine anonymisierte geschäftliche E-Mail (PII bereits durch ` +
    `Platzhalter wie {{NAME_1}}, {{EMAIL_1}} ersetzt).\n\n` +
    `AUFGABE 1 — VORLAGE:\n` +
    `Erstelle eine wiederverwendbare Mail-Vorlage daraus.\n` +
    `- Vergib einen kurzen key (kebab-case, z.B. 'versand-info')\n` +
    `- Vergib einen lesbaren deutschen Namen\n` +
    `- Behalte alle {{PLATZHALTER}} bei\n` +
    `${existingKeysHint ? `- ${existingKeysHint}\n` : ''}` +
    `\nAUFGABE 2 — WISSEN:\n` +
    `Extrahiere Regeln, Ablaeufe, Produkt-/Service-Erklaerungen, Lieferzeiten, Policies und Slogans als Wissens-Eintraege.\n` +
    `- Keine Preislisten oder konkreten aktuellen Preise als KnowledgeEntry extrahieren. Preise gehoeren in PriceItem (/app/prices).\n` +
    `- Preisbezogene Regeln ohne konkrete Preislisten sind erlaubt, z.B. wann ein individuelles Angebot noetig ist.\n` +
    `- Pro Eintrag: title, keywords (3-6 deutsche Trigger-Wörter), content, category\n` +
    `- Kategorien: produkte | lieferung | policies | ablauf | sonstiges\n` +
    `${existingTitlesHint ? `- ${existingTitlesHint}\n` : ''}` +
    `- Keine PII als Wissen speichern\n` +
    `\nAUFGABE 3 — STIL-RELEVANZ:\n` +
    `Ist diese Mail lang/substanziell genug um den Schreibstil zu analysieren? ` +
    `(Mindestens 3 Sätze eigener Text, nicht nur Grußformel)\n\n` +
    `Antwortformat: Nur JSON, kein Markdown.\n` +
    `{\n` +
    `  "template": { "key": "...", "name": "...", "subject": "...", "body": "...", "placeholders": [...] } oder null,\n` +
    `  "knowledge": [{ "title": "...", "keywords": [...], "content": "...", "category": "..." }],\n` +
    `  "styleRelevant": true/false\n` +
    `}\n\n` +
    `E-Mail:\n${anonymizedText}`

  const defaults = await getGlobalAiDefaults()

  const raw = await callLLM({
    systemPrompt,
    userPrompt,
    provider: profile.preferredProvider || defaults.provider,
    model: profile.preferredModel || defaults.model,
    apiKey: profile.apiKey ?? undefined,
    maxTokens: 1500,
  })

  // 3. JSON parsen mit Fallback
  let parsed: LLMResponse = { template: null, knowledge: [], styleRelevant: false }
  try {
    const cleaned = raw.replace(/```json\n?/g, '').replace(/```\n?/g, '').trim()
    parsed = JSON.parse(cleaned) as LLMResponse
  } catch {
    // Parsing fehlgeschlagen → leere Ergebnisse zurückgeben
  }

  // 4. Template-Key Kollisions-Check
  let template = parsed.template ?? null
  if (template) {
    let key = template.key?.trim() || 'vorlage'
    if (existingTemplateKeys.includes(key)) {
      let suffix = 2
      while (existingTemplateKeys.includes(`${key}-${suffix}`)) suffix++
      key = `${key}-${suffix}`
    }
    template = { ...template, key }
  }

  // 5. Knowledge bereinigen: leere Einträge und Duplikate zu existingTitles entfernen
  const knowledge = (parsed.knowledge ?? []).filter(
    k => k.title?.trim() && !existingKnowledgeTitles.includes(k.title.trim())
  )

  return {
    anonymizedText,
    tokenMap,
    hadPII,
    suggestedTemplate: template,
    suggestedKnowledge: knowledge,
    styleRelevant: parsed.styleRelevant === true,
  }
}
