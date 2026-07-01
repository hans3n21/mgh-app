import { NextResponse } from 'next/server'
import { getServerSession } from 'next-auth'
import { authOptions } from '@/lib/auth'
import { prisma } from '@/lib/prisma'
import { processMailBatch } from '@/lib/ai/batch-processor'

const MAX_BATCH_SIZE = 15

export async function POST(req: Request) {
  const session = await getServerSession(authOptions)
  if (!session?.user?.id) {
    return NextResponse.json({ error: 'Nicht authentifiziert' }, { status: 401 })
  }

  let body: { mailAccountId?: string; mails?: string[] }
  try {
    body = await req.json()
  } catch {
    return NextResponse.json({ error: 'Ungültiger Request-Body' }, { status: 400 })
  }

  const { mailAccountId, mails } = body

  if (!mailAccountId) {
    return NextResponse.json({ error: 'mailAccountId fehlt' }, { status: 400 })
  }
  if (!Array.isArray(mails) || mails.length === 0) {
    return NextResponse.json({ error: 'mails muss ein nicht-leeres Array sein' }, { status: 400 })
  }
  if (mails.length > MAX_BATCH_SIZE) {
    return NextResponse.json(
      { error: `Maximal ${MAX_BATCH_SIZE} Mails pro Batch erlaubt` },
      { status: 400 }
    )
  }

  const aiProfile = await prisma.aiProfile.findUnique({ where: { mailAccountId } })
  if (!aiProfile) {
    return NextResponse.json({ error: 'Kein AI-Profil für dieses Postfach' }, { status: 404 })
  }

  const [existingTemplates, existingKnowledge] = await Promise.all([
    prisma.emailTemplate.findMany({
      where: { mailAccountId },
      select: { key: true },
    }),
    prisma.knowledgeEntry.findMany({
      where: { mailAccountId },
      select: { title: true },
    }),
  ])

  const existingTemplateKeys = existingTemplates.map(t => t.key)
  const existingKnowledgeTitles = existingKnowledge.map(k => k.title)

  try {
    const result = await processMailBatch(
      mails,
      aiProfile,
      existingTemplateKeys,
      existingKnowledgeTitles
    )
    return NextResponse.json(result)
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : 'Unbekannter Fehler'
    return NextResponse.json({ error: message }, { status: 500 })
  }
}
