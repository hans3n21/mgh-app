import { NextRequest, NextResponse } from 'next/server'
import { z } from 'zod'
import { auth } from '@/lib/auth'
import { prisma } from '@/lib/prisma'
import {
  deleteGlobalKnowledgeEntry,
  type GlobalKnowledgeUpdateInput,
  isMissingGlobalKnowledgeTable,
  updateGlobalKnowledgeEntry,
} from '@/lib/knowledge/global-knowledge'

const KnowledgeUpdateSchema = z.object({
  title: z.string().min(1).optional(),
  keywords: z.array(z.string()).optional(),
  content: z.string().min(1).optional(),
  category: z.string().nullable().optional(),
  status: z.enum(['draft', 'review', 'approved', 'archived']).optional(),
  kiFreigabe: z.boolean().optional(),
  isActive: z.boolean().optional(),
})

function isAdmin(role?: string) {
  return role === 'admin' || role === 'admin_no_feedback'
}

function normalizeKeywords(keywords: string[]) {
  return Array.from(
    new Set(
      keywords
        .map((keyword) => keyword.trim().toLowerCase())
        .filter(Boolean)
    )
  ).slice(0, 20)
}

export async function PATCH(request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const session = await auth()
  if (!session?.user) {
    return NextResponse.json({ error: 'Nicht authentifiziert' }, { status: 401 })
  }

  let body: z.infer<typeof KnowledgeUpdateSchema>
  try {
    body = KnowledgeUpdateSchema.parse(await request.json())
  } catch (error) {
    if (error instanceof z.ZodError) {
      return NextResponse.json({ error: 'Ungueltige Daten', details: error.issues }, { status: 400 })
    }
    return NextResponse.json({ error: 'Ungueltiger Request-Body' }, { status: 400 })
  }

  const { id } = await params
  const admin = isAdmin(session.user.role)

  const data: GlobalKnowledgeUpdateInput = {
    updatedBy: session.user.name ?? session.user.email ?? null,
  }

  if (body.title !== undefined) data.title = body.title.trim()
  if (body.keywords !== undefined) data.keywords = normalizeKeywords(body.keywords)
  if (body.content !== undefined) data.content = body.content.trim()
  if (body.category !== undefined) data.category = body.category?.trim() || null

  if (admin) {
    if (body.status !== undefined) data.status = body.status
    if (body.kiFreigabe !== undefined) data.kiFreigabe = body.kiFreigabe
    if (body.isActive !== undefined) data.isActive = body.isActive

    if (data.status && data.status !== 'approved') data.isActive = false
    if (data.kiFreigabe === false) data.isActive = false
  }

  try {
    const entry = await updateGlobalKnowledgeEntry(prisma, id, data)
    if (!entry) {
      return NextResponse.json({ error: 'Wissenseintrag nicht gefunden' }, { status: 404 })
    }
    return NextResponse.json(entry)
  } catch (error) {
    if (isMissingGlobalKnowledgeTable(error)) {
      return NextResponse.json({ error: 'Globale Wissensbasis ist noch nicht migriert' }, { status: 503 })
    }
    console.error('[knowledge PATCH]', error)
    return NextResponse.json({ error: 'Wissenseintrag konnte nicht gespeichert werden' }, { status: 500 })
  }
}

export async function DELETE(_request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const session = await auth()
  if (!session?.user) {
    return NextResponse.json({ error: 'Nicht authentifiziert' }, { status: 401 })
  }

  if (!isAdmin(session.user.role)) {
    return NextResponse.json({ error: 'Nur Admins koennen Wissenseintraege loeschen' }, { status: 403 })
  }

  const { id } = await params

  try {
    await deleteGlobalKnowledgeEntry(prisma, id)
    return NextResponse.json({ ok: true })
  } catch (error) {
    if (isMissingGlobalKnowledgeTable(error)) {
      return NextResponse.json({ error: 'Globale Wissensbasis ist noch nicht migriert' }, { status: 503 })
    }
    console.error('[knowledge DELETE]', error)
    return NextResponse.json({ error: 'Wissenseintrag konnte nicht geloescht werden' }, { status: 500 })
  }
}
