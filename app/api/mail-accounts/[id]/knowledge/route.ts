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
  const entries = await prisma.knowledgeEntry.findMany({
    where: { mailAccountId: id },
    orderBy: [{ sortOrder: 'asc' }, { createdAt: 'asc' }],
  })
  return NextResponse.json(entries)
}

export async function POST(req: Request, { params }: { params: Promise<{ id: string }> }) {
  const session = await getServerSession(authOptions)
  if (!session?.user) {
    return NextResponse.json({ error: 'Nicht authentifiziert' }, { status: 401 })
  }

  const { id } = await params

  let data: { title?: string; keywords?: string[]; content?: string; category?: string }
  try {
    data = await req.json()
  } catch {
    return NextResponse.json({ error: 'Ungültiger Request-Body' }, { status: 400 })
  }

  if (!data.title?.trim() || !data.content?.trim()) {
    return NextResponse.json({ error: 'Titel und Inhalt sind Pflichtfelder' }, { status: 400 })
  }

  const entry = await prisma.knowledgeEntry.create({
    data: {
      mailAccountId: id,
      title: data.title.trim(),
      keywords: data.keywords ?? [],
      content: data.content.trim(),
      category: data.category ?? null,
    },
  })

  return NextResponse.json(entry, { status: 201 })
}
