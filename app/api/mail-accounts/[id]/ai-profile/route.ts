import { NextResponse } from 'next/server'
import { getServerSession } from 'next-auth'
import { authOptions } from '@/lib/auth'
import { prisma } from '@/lib/prisma'

export async function GET(req: Request, { params }: { params: Promise<{ id: string }> }) {
  const session = await getServerSession(authOptions)
  if (!session?.user) {
    return NextResponse.json({ error: 'Nicht authentifiziert' }, { status: 401 })
  }

  const { id } = await params
  const profile = await prisma.aiProfile.findUnique({ where: { mailAccountId: id } })
  return NextResponse.json(profile)
}

export async function PUT(req: Request, { params }: { params: Promise<{ id: string }> }) {
  const session = await getServerSession(authOptions)
  if (!session?.user) {
    return NextResponse.json({ error: 'Nicht authentifiziert' }, { status: 401 })
  }

  const { id } = await params

  let data: Record<string, unknown>
  try {
    data = await req.json()
  } catch {
    return NextResponse.json({ error: 'Ungültiger Request-Body' }, { status: 400 })
  }

  // Nur erlaubte Felder übernehmen
  const allowedFields = [
    'tone', 'formality', 'signatureName', 'customInstructions',
    'businessContext', 'preferredModel', 'preferredProvider', 'apiKey',
  ]

  const updateData: Record<string, unknown> = {}
  for (const key of allowedFields) {
    if (key in data) updateData[key] = data[key]
  }

  try {
    const profile = await prisma.aiProfile.upsert({
      where: { mailAccountId: id },
      create: { mailAccountId: id, ...updateData },
      update: updateData,
    })
    return NextResponse.json(profile)
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : 'Unbekannter Fehler'
    console.error('[ai-profile PUT]', message)
    return NextResponse.json({ error: message }, { status: 500 })
  }
}
