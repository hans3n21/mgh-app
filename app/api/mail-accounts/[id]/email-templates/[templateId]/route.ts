import { NextResponse } from 'next/server'
import { getServerSession } from 'next-auth'
import { authOptions } from '@/lib/auth'
import { prisma } from '@/lib/prisma'

function extractPlaceholders(body: string): string[] {
  const matches = body.match(/\{(\w+)\}/g) ?? []
  return Array.from(new Set(matches.map(m => m.slice(1, -1))))
}

export async function PATCH(
  req: Request,
  { params }: { params: Promise<{ id: string; templateId: string }> }
) {
  const session = await getServerSession(authOptions)
  if (!session?.user) {
    return NextResponse.json({ error: 'Nicht authentifiziert' }, { status: 401 })
  }

  const { templateId } = await params

  let data: Record<string, unknown>
  try {
    data = await req.json()
  } catch {
    return NextResponse.json({ error: 'Ungültiger Request-Body' }, { status: 400 })
  }

  const allowedFields = ['key', 'name', 'subject', 'body', 'isActive', 'sortOrder']
  const updateData: Record<string, unknown> = {}
  for (const key of allowedFields) {
    if (key in data) updateData[key] = data[key]
  }

  if (typeof updateData.body === 'string') {
    updateData.placeholders = extractPlaceholders(updateData.body)
  }

  try {
    const template = await prisma.emailTemplate.update({
      where: { id: templateId },
      data: updateData,
    })
    return NextResponse.json(template)
  } catch {
    return NextResponse.json({ error: 'Vorlage nicht gefunden' }, { status: 404 })
  }
}

export async function DELETE(
  req: Request,
  { params }: { params: Promise<{ id: string; templateId: string }> }
) {
  const session = await getServerSession(authOptions)
  if (!session?.user) {
    return NextResponse.json({ error: 'Nicht authentifiziert' }, { status: 401 })
  }

  const { templateId } = await params

  try {
    await prisma.emailTemplate.delete({ where: { id: templateId } })
    return NextResponse.json({ ok: true })
  } catch {
    return NextResponse.json({ error: 'Vorlage nicht gefunden' }, { status: 404 })
  }
}
