import type { PrismaClient } from '@prisma/client'
import type { KnowledgePromptEntry } from './keyword-matcher'
import {
  isMissingGlobalKnowledgeTable,
  listActiveGlobalKnowledgeEntries,
} from '@/lib/knowledge/global-knowledge'

type KnowledgeClient = Pick<PrismaClient, 'knowledgeEntry' | '$queryRaw'>

function normalizeKnowledgeKey(entry: KnowledgePromptEntry) {
  return `${entry.category ?? ''}:${entry.title}`.toLowerCase().trim()
}

function mergeKnowledgeEntries(
  globalEntries: KnowledgePromptEntry[],
  accountEntries: KnowledgePromptEntry[]
) {
  const merged = new Map<string, KnowledgePromptEntry>()

  for (const entry of globalEntries) {
    merged.set(normalizeKnowledgeKey(entry), entry)
  }

  // Account-specific entries intentionally override global entries with the same title/category.
  for (const entry of accountEntries) {
    merged.set(normalizeKnowledgeKey(entry), entry)
  }

  return Array.from(merged.values()).sort(
    (left, right) =>
      left.sortOrder - right.sortOrder ||
      left.title.localeCompare(right.title)
  )
}

export async function loadKnowledgeForPrompt(
  prisma: KnowledgeClient,
  mailAccountId: string
): Promise<KnowledgePromptEntry[]> {
  const accountEntriesPromise = prisma.knowledgeEntry.findMany({
    where: { mailAccountId, isActive: true },
    orderBy: { sortOrder: 'asc' },
  })

  const globalEntriesPromise = listActiveGlobalKnowledgeEntries(prisma as PrismaClient)
    .catch((error) => {
      if (isMissingGlobalKnowledgeTable(error)) return []
      throw error
    })

  const [accountEntries, globalEntries] = await Promise.all([
    accountEntriesPromise,
    globalEntriesPromise,
  ])

  return mergeKnowledgeEntries(globalEntries, accountEntries)
}
