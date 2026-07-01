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
  const templates = await prisma.emailTemplate.findMany({
    where: { mailAccountId: id },
    orderBy: [{ sortOrder: 'asc' }, { createdAt: 'asc' }],
  })
  return NextResponse.json(templates)
}

// Extrahiert Platzhalter aus Template-Body: {kundenname}, {bestellnr}, etc.
function extractPlaceholders(body: string): string[] {
  const matches = body.match(/\{(\w+)\}/g) ?? []
  return Array.from(new Set(matches.map(m => m.slice(1, -1))))
}

export async function POST(req: Request, { params }: { params: Promise<{ id: string }> }) {
  const session = await getServerSession(authOptions)
  if (!session?.user) {
    return NextResponse.json({ error: 'Nicht authentifiziert' }, { status: 401 })
  }

  const { id } = await params

  let data: { key?: string; name?: string; subject?: string; body?: string }
  try {
    data = await req.json()
  } catch {
    return NextResponse.json({ error: 'Ungültiger Request-Body' }, { status: 400 })
  }

  if (!data.key?.trim() || !data.name?.trim() || !data.body?.trim()) {
    return NextResponse.json({ error: 'key, name und body sind Pflichtfelder' }, { status: 400 })
  }

  try {
    const template = await prisma.emailTemplate.create({
      data: {
        mailAccountId: id,
        key: data.key.trim().toLowerCase(),
        name: data.name.trim(),
        subject: data.subject?.trim() ?? null,
        body: data.body.trim(),
        placeholders: extractPlaceholders(data.body),
      },
    })
    return NextResponse.json(template, { status: 201 })
  } catch (err: unknown) {
    const msg = err instanceof Error ? err.message : ''
    if (msg.includes('Unique constraint')) {
      return NextResponse.json({ error: 'Dieser Schlüssel existiert bereits für dieses Postfach' }, { status: 409 })
    }
    return NextResponse.json({ error: 'Fehler beim Erstellen' }, { status: 500 })
  }
}
