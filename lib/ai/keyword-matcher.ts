import type { KnowledgeEntry } from '@prisma/client'

export type KnowledgePromptEntry = Pick<
  KnowledgeEntry,
  'id' | 'title' | 'keywords' | 'content' | 'category' | 'isActive' | 'sortOrder' | 'createdAt' | 'updatedAt'
>

export type MatchedEntry<TEntry extends KnowledgePromptEntry = KnowledgePromptEntry> = {
  entry: TEntry
  matchedKeywords: string[]
  matchCount: number
}

/**
 * Prüft welche KnowledgeEntries zum Input-Text passen.
 * Gibt max. 5 Treffer zurück, sortiert nach Keyword-Anzahl (relevanteste zuerst).
 */
export function matchKnowledgeEntries(
  inputText: string,
  entries: KnowledgePromptEntry[]
): MatchedEntry[] {
  const lowerText = inputText.toLowerCase()

  const results: MatchedEntry[] = []

  for (const entry of entries) {
    if (!entry.isActive) continue

    const matchedKeywords: string[] = []

    for (const keyword of entry.keywords) {
      const lowerKeyword = keyword.toLowerCase().trim()
      if (!lowerKeyword) continue
      // Wortgrenzen-Check: \b funktioniert für ASCII, für Umlaute manuell prüfen
      const regex = new RegExp(`(^|[^a-zäöüß])${escapeRegex(lowerKeyword)}([^a-zäöüß]|$)`, 'i')
      if (regex.test(lowerText)) {
        matchedKeywords.push(keyword)
      }
    }

    if (matchedKeywords.length > 0) {
      results.push({ entry, matchedKeywords, matchCount: matchedKeywords.length })
    }
  }

  return results
    .sort((a, b) => b.matchCount - a.matchCount)
    .slice(0, 5)
}

function escapeRegex(str: string): string {
  return str.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')
}
