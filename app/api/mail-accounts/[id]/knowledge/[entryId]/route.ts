import { NextResponse } from 'next/server'
import { getServerSession } from 'next-auth'
import { authOptions } from '@/lib/auth'
import { prisma } from '@/lib/prisma'

export async function PATCH(
  req: Request,
  { params }: { params: Promise<{ id: string; entryId: string }> }
) {
  const session = await getServerSession(authOptions)
  if (!session?.user) {
    return NextResponse.json({ error: 'Nicht authentifiziert' }, { status: 401 })
  }

  const { entryId } = await params

  let data: Record<string, unknown>
  try {
    data = await req.json()
  } catch {
    return NextResponse.json({ error: 'Ungültiger Request-Body' }, { status: 400 })
  }

  const allowedFields = ['title', 'keywords', 'content', 'category', 'isActive', 'sortOrder']
  const updateData: Record<string, unknown> = {}
  for (const key of allowedFields) {
    if (key in data) updateData[key] = data[key]
  }

  try {
    const entry = await prisma.knowledgeEntry.update({
      where: { id: entryId },
      data: updateData,
    })
    return NextResponse.json(entry)
  } catch {
    return NextResponse.json({ error: 'Eintrag nicht gefunden' }, { status: 404 })
  }
}

export async function DELETE(
  req: Request,
  { params }: { params: Promise<{ id: string; entryId: string }> }
) {
  const session = await getServerSession(authOptions)
  if (!session?.user) {
    return NextResponse.json({ error: 'Nicht authentifiziert' }, { status: 401 })
  }

  const { entryId } = await params

  try {
    await prisma.knowledgeEntry.delete({ where: { id: entryId } })
    return NextResponse.json({ ok: true })
  } catch {
    return NextResponse.json({ error: 'Eintrag nicht gefunden' }, { status: 404 })
  }
}
