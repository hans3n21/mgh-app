import { Prisma, type PrismaClient } from '@prisma/client'
import { randomUUID } from 'crypto'

export type GlobalKnowledgeRow = {
  id: string
  title: string
  keywords: string[]
  content: string
  category: string | null
  status: string
  kiFreigabe: boolean
  isActive: boolean
  sourcePath: string | null
  sortOrder: number
  createdBy: string | null
  updatedBy: string | null
  createdAt: Date
  updatedAt: Date
}

export type GlobalKnowledgeFilters = {
  q?: string
  status?: string
  category?: string
  active?: boolean
}

export type GlobalKnowledgeCreateInput = {
  title: string
  keywords: string[]
  content: string
  category: string | null
  status: string
  kiFreigabe: boolean
  isActive: boolean
  createdBy: string | null
  updatedBy: string | null
}

export type GlobalKnowledgeUpdateInput = Partial<{
  title: string
  keywords: string[]
  content: string
  category: string | null
  status: string
  kiFreigabe: boolean
  isActive: boolean
  updatedBy: string | null
}>

const GLOBAL_KNOWLEDGE_SELECT = Prisma.sql`
  "id",
  "title",
  "keywords",
  "content",
  "category",
  "status",
  "kiFreigabe",
  "isActive",
  "sourcePath",
  "sortOrder",
  "createdBy",
  "updatedBy",
  "createdAt",
  "updatedAt"
`

function keywordArraySql(keywords: string[]) {
  if (keywords.length === 0) return Prisma.sql`ARRAY[]::text[]`
  return Prisma.sql`ARRAY[${Prisma.join(keywords)}]::text[]`
}

function rowMatchesFilters(row: GlobalKnowledgeRow, filters: GlobalKnowledgeFilters) {
  if (filters.status && row.status !== filters.status) return false
  if (filters.category && row.category !== filters.category) return false
  if (filters.active !== undefined && row.isActive !== filters.active) return false

  const query = filters.q?.toLowerCase().trim()
  if (!query) return true

  const haystack = [
    row.title,
    row.content,
    row.category ?? '',
    row.keywords.join(' '),
  ].join(' ').toLowerCase()

  return haystack.includes(query)
}

export function isMissingGlobalKnowledgeTable(error: unknown) {
  const text = error instanceof Error ? error.message : String(error)
  return text.includes('GlobalKnowledgeEntry') && (
    text.includes('does not exist') ||
    text.includes('existiert nicht') ||
    text.includes('P2010') ||
    text.includes('P2021')
  )
}

export async function listGlobalKnowledgeEntries(
  prisma: PrismaClient,
  filters: GlobalKnowledgeFilters = {}
) {
  const rows = await prisma.$queryRaw<GlobalKnowledgeRow[]>(Prisma.sql`
    SELECT ${GLOBAL_KNOWLEDGE_SELECT}
    FROM "GlobalKnowledgeEntry"
    ORDER BY "sortOrder" ASC, "updatedAt" DESC
  `)

  return rows.filter((row) => rowMatchesFilters(row, filters))
}

export async function listActiveGlobalKnowledgeEntries(prisma: PrismaClient) {
  return prisma.$queryRaw<GlobalKnowledgeRow[]>(Prisma.sql`
    SELECT ${GLOBAL_KNOWLEDGE_SELECT}
    FROM "GlobalKnowledgeEntry"
    WHERE "isActive" = true
      AND "status" = 'approved'
      AND "kiFreigabe" = true
    ORDER BY "sortOrder" ASC, "createdAt" ASC
  `)
}

export async function createGlobalKnowledgeEntry(
  prisma: PrismaClient,
  input: GlobalKnowledgeCreateInput
) {
  const id = randomUUID()
  const maxRows = await prisma.$queryRaw<Array<{ sortOrder: number }>>(Prisma.sql`
    SELECT COALESCE(MAX("sortOrder"), 0)::int AS "sortOrder"
    FROM "GlobalKnowledgeEntry"
  `)
  const sortOrder = (maxRows[0]?.sortOrder ?? 0) + 1

  const rows = await prisma.$queryRaw<GlobalKnowledgeRow[]>(Prisma.sql`
    INSERT INTO "GlobalKnowledgeEntry" (
      "id",
      "title",
      "keywords",
      "content",
      "category",
      "status",
      "kiFreigabe",
      "isActive",
      "sortOrder",
      "createdBy",
      "updatedBy",
      "updatedAt"
    )
    VALUES (
      ${id},
      ${input.title},
      ${keywordArraySql(input.keywords)},
      ${input.content},
      ${input.category},
      ${input.status},
      ${input.kiFreigabe},
      ${input.isActive},
      ${sortOrder},
      ${input.createdBy},
      ${input.updatedBy},
      CURRENT_TIMESTAMP
    )
    RETURNING ${GLOBAL_KNOWLEDGE_SELECT}
  `)

  return rows[0]
}

export async function updateGlobalKnowledgeEntry(
  prisma: PrismaClient,
  id: string,
  input: GlobalKnowledgeUpdateInput
) {
  const setClauses: Prisma.Sql[] = [
    Prisma.sql`"updatedAt" = CURRENT_TIMESTAMP`,
  ]

  if ('title' in input) setClauses.push(Prisma.sql`"title" = ${input.title}`)
  if ('keywords' in input) setClauses.push(Prisma.sql`"keywords" = ${keywordArraySql(input.keywords ?? [])}`)
  if ('content' in input) setClauses.push(Prisma.sql`"content" = ${input.content}`)
  if ('category' in input) setClauses.push(Prisma.sql`"category" = ${input.category}`)
  if ('status' in input) setClauses.push(Prisma.sql`"status" = ${input.status}`)
  if ('kiFreigabe' in input) setClauses.push(Prisma.sql`"kiFreigabe" = ${input.kiFreigabe}`)
  if ('isActive' in input) setClauses.push(Prisma.sql`"isActive" = ${input.isActive}`)
  if ('updatedBy' in input) setClauses.push(Prisma.sql`"updatedBy" = ${input.updatedBy}`)

  const rows = await prisma.$queryRaw<GlobalKnowledgeRow[]>(Prisma.sql`
    UPDATE "GlobalKnowledgeEntry"
    SET ${Prisma.join(setClauses, ', ')}
    WHERE "id" = ${id}
    RETURNING ${GLOBAL_KNOWLEDGE_SELECT}
  `)

  return rows[0] ?? null
}

export async function deleteGlobalKnowledgeEntry(prisma: PrismaClient, id: string) {
  await prisma.$executeRaw(Prisma.sql`
    DELETE FROM "GlobalKnowledgeEntry"
    WHERE "id" = ${id}
  `)
}
