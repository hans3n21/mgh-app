import { NextResponse } from 'next/server'
import { getServerSession } from 'next-auth'
import { authOptions } from '@/lib/auth'
import { prisma } from '@/lib/prisma'
import { analyzeStyle } from '@/lib/ai/style-analyzer'

export async function POST(req: Request) {
  const session = await getServerSession(authOptions)
  if (!session?.user) {
    return NextResponse.json({ error: 'Nicht authentifiziert' }, { status: 401 })
  }

  let mailAccountId: string
  try {
    const body = await req.json()
    mailAccountId = body.mailAccountId
  } catch {
    return NextResponse.json({ error: 'Ungültiger Request-Body' }, { status: 400 })
  }

  if (!mailAccountId) {
    return NextResponse.json({ error: 'mailAccountId fehlt' }, { status: 400 })
  }

  const [aiProfile, emailTemplates] = await Promise.all([
    prisma.aiProfile.findUnique({ where: { mailAccountId } }),
    prisma.emailTemplate.findMany({
      where: { mailAccountId, isActive: true },
      orderBy: { sortOrder: 'asc' },
    }),
  ])

  if (!aiProfile) {
    return NextResponse.json({ error: 'Kein AI-Profil für dieses Postfach' }, { status: 404 })
  }

  try {
    const generatedStyleProfile = await analyzeStyle(emailTemplates, aiProfile)

    const updated = await prisma.aiProfile.update({
      where: { mailAccountId },
      data: { generatedStyleProfile },
    })

    return NextResponse.json({ generatedStyleProfile: updated.generatedStyleProfile })
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : 'Unbekannter Fehler'

    // Sprechende Fehlermeldung für fehlenden API-Key
    const isApiKeyError =
      message.includes('API-Key') ||
      message.includes('konfiguriert') ||
      message.includes('401') ||
      message.toLowerCase().includes('unauthorized') ||
      message.toLowerCase().includes('invalid api key')

    if (isApiKeyError) {
      return NextResponse.json(
        { error: 'Kein API-Key konfiguriert. Trage einen OpenAI- oder Anthropic-Key im Feld "Eigener API-Key" ein und speichere.' },
        { status: 400 }
      )
    }

    return NextResponse.json({ error: message }, { status: 500 })
  }
}
