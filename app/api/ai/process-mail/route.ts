import { NextResponse } from 'next/server'
import { getServerSession } from 'next-auth'
import { authOptions } from '@/lib/auth'
import { prisma } from '@/lib/prisma'
import { processMailForTraining } from '@/lib/ai/mail-processor'

export async function POST(req: Request) {
  const session = await getServerSession(authOptions)
  if (!session?.user?.id) {
    return NextResponse.json({ error: 'Nicht authentifiziert' }, { status: 401 })
  }

  let body: { mailAccountId?: string; rawMailText?: string }
  try {
    body = await req.json()
  } catch {
    return NextResponse.json({ error: 'Ungültiger Request-Body' }, { status: 400 })
  }

  const { mailAccountId, rawMailText } = body

  if (!mailAccountId) {
    return NextResponse.json({ error: 'mailAccountId fehlt' }, { status: 400 })
  }
  if (!rawMailText?.trim()) {
    return NextResponse.json({ error: 'rawMailText fehlt oder leer' }, { status: 400 })
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
    const result = await processMailForTraining(
      rawMailText,
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
