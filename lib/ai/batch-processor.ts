import { processMailForTraining, type ProcessedMail, type SuggestedKnowledgeEntry } from './mail-processor'
import type { AiProfile } from '@prisma/client'

export type BatchResult = {
  results: ProcessedMail[]
  deduplicatedKnowledge: SuggestedKnowledgeEntry[]
}

/**
 * Verarbeitet mehrere Mails sequentiell.
 * Aktualisiert existingTemplateKeys nach jeder Mail um Duplikate zu vermeiden.
 * Dedupliziert Knowledge-Einträge über alle Mails hinweg.
 */
export async function processMailBatch(
  mails: string[],
  profile: AiProfile,
  existingTemplateKeys: string[],
  existingKnowledgeTitles: string[]
): Promise<BatchResult> {
  const results: ProcessedMail[] = []
  const accumulatedKeys = [...existingTemplateKeys]
  const accumulatedTitles = [...existingKnowledgeTitles]

  for (const mailText of mails) {
    if (!mailText?.trim()) continue

    const result = await processMailForTraining(
      mailText,
      profile,
      accumulatedKeys,
      accumulatedTitles
    )

    results.push(result)

    // Key + Titel für nächste Iteration merken (damit keine Duplikate entstehen)
    if (result.suggestedTemplate?.key) {
      accumulatedKeys.push(result.suggestedTemplate.key)
    }
    for (const k of result.suggestedKnowledge) {
      if (k.title?.trim()) accumulatedTitles.push(k.title.trim())
    }
  }

  // Knowledge aus allen Mails sammeln und deduplizieren
  const allKnowledge = results.flatMap(r => r.suggestedKnowledge)
  const deduplicatedKnowledge = deduplicateKnowledge(allKnowledge)

  return { results, deduplicatedKnowledge }
}

/**
 * Dedupliziert Knowledge-Einträge: Wenn zwei Einträge >50% Keyword-Overlap haben,
 * wird der mit dem längeren Content behalten.
 */
function deduplicateKnowledge(entries: SuggestedKnowledgeEntry[]): SuggestedKnowledgeEntry[] {
  const deduplicated: SuggestedKnowledgeEntry[] = []

  for (const entry of entries) {
    const duplicate = deduplicated.find(existing => keywordOverlap(existing.keywords, entry.keywords) > 0.5)

    if (duplicate) {
      if (entry.content.length > duplicate.content.length) {
        const idx = deduplicated.indexOf(duplicate)
        deduplicated[idx] = entry
      }
    } else {
      deduplicated.push(entry)
    }
  }

  return deduplicated
}

function keywordOverlap(a: string[], b: string[]): number {
  if (a.length === 0 || b.length === 0) return 0
  const lowerA = a.map(k => k.toLowerCase())
  const lowerB = b.map(k => k.toLowerCase())
  const setB = new Set(lowerB)
  const shared = lowerA.filter(k => setB.has(k)).length
  return shared / Math.max(lowerA.length, lowerB.length)
}
