import { NextResponse } from 'next/server'
import { getServerSession } from 'next-auth'
import { authOptions } from '@/lib/auth'
import { prisma } from '@/lib/prisma'
import { z } from 'zod'

const TemplateSchema = z.object({
  key: z.string().min(1),
  name: z.string().min(1),
  subject: z.string().default(''),
  body: z.string().min(1),
  placeholders: z.array(z.string()).default([]),
})

const KnowledgeSchema = z.object({
  title: z.string().min(1),
  keywords: z.array(z.string()).default([]),
  content: z.string().min(1),
  category: z.string().default('sonstiges'),
})

const BodySchema = z.object({
  mailAccountId: z.string().min(1),
  templates: z.array(TemplateSchema).default([]),
  knowledge: z.array(KnowledgeSchema).default([]),
  updateStyle: z.boolean().default(false),
})

export async function POST(req: Request) {
  const session = await getServerSession(authOptions)
  if (!session?.user?.id) {
    return NextResponse.json({ error: 'Nicht authentifiziert' }, { status: 401 })
  }

  let body: z.infer<typeof BodySchema>
  try {
    const raw = await req.json()
    body = BodySchema.parse(raw)
  } catch (err) {
    const message = err instanceof z.ZodError
      ? err.issues.map((e: z.ZodIssue) => e.message).join(', ')
      : 'Ungültiger Request-Body'
    return NextResponse.json({ error: message }, { status: 400 })
  }

  const { mailAccountId, templates, knowledge, updateStyle } = body

  // Prüfen ob das Postfach existiert
  const mailAccount = await prisma.mailAccount.findUnique({
    where: { id: mailAccountId },
    select: { id: true },
  })
  if (!mailAccount) {
    return NextResponse.json({ error: 'Postfach nicht gefunden' }, { status: 404 })
  }

  let savedTemplates = 0
  let savedKnowledge = 0

  // Templates speichern (vorhandene Keys überspringen)
  if (templates.length > 0) {
    const existingKeys = await prisma.emailTemplate
      .findMany({ where: { mailAccountId }, select: { key: true } })
      .then(rows => new Set(rows.map(r => r.key)))

    const newTemplates = templates.filter(t => !existingKeys.has(t.key))

    if (newTemplates.length > 0) {
      // sortOrder: nach letztem bestehenden sortOrder
      const maxSortOrder = await prisma.emailTemplate
        .aggregate({ where: { mailAccountId }, _max: { sortOrder: true } })
        .then(r => r._max.sortOrder ?? 0)

      const data = newTemplates.map((t, i) => ({
        mailAccountId,
        key: t.key,
        name: t.name,
        subject: t.subject,
        body: t.body,
        placeholders: t.placeholders,
        isActive: true,
        sortOrder: maxSortOrder + i + 1,
      }))

      const result = await prisma.emailTemplate.createMany({ data })
      savedTemplates = result.count
    }
  }

  // Knowledge-Einträge speichern (vorhandene Titel überspringen)
  if (knowledge.length > 0) {
    const existingTitles = await prisma.knowledgeEntry
      .findMany({ where: { mailAccountId }, select: { title: true } })
      .then(rows => new Set(rows.map(r => r.title)))

    const newKnowledge = knowledge.filter(k => !existingTitles.has(k.title))

    if (newKnowledge.length > 0) {
      const maxSortOrder = await prisma.knowledgeEntry
        .aggregate({ where: { mailAccountId }, _max: { sortOrder: true } })
        .then(r => r._max.sortOrder ?? 0)

      const data = newKnowledge.map((k, i) => ({
        mailAccountId,
        title: k.title,
        keywords: k.keywords,
        content: k.content,
        category: k.category,
        isActive: true,
        sortOrder: maxSortOrder + i + 1,
      }))

      const result = await prisma.knowledgeEntry.createMany({ data })
      savedKnowledge = result.count
    }
  }

  // Stil-Analyse triggern wenn gewünscht
  if (updateStyle) {
    try {
      const baseUrl = process.env.NEXTAUTH_URL || 'http://localhost:3000'
      await fetch(`${baseUrl}/api/ai/analyze-style`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', Cookie: req.headers.get('cookie') ?? '' },
        body: JSON.stringify({ mailAccountId }),
      })
    } catch {
      // Stil-Analyse-Fehler sind nicht kritisch — Response trotzdem senden
    }
  }

  return NextResponse.json({ savedTemplates, savedKnowledge })
}
