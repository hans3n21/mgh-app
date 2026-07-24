import { NextRequest, NextResponse } from 'next/server'
import { z } from 'zod'
import { auth } from '@/lib/auth'
import { prisma } from '@/lib/prisma'
import {
  createGlobalKnowledgeEntry,
  isMissingGlobalKnowledgeTable,
  listGlobalKnowledgeEntries,
} from '@/lib/knowledge/global-knowledge'

const KnowledgeCreateSchema = z.object({
  title: z.string().min(1),
  keywords: z.array(z.string()).default([]),
  content: z.string().min(1),
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

export async function GET(request: NextRequest) {
  const session = await auth()
  if (!session?.user) {
    return NextResponse.json({ error: 'Nicht authentifiziert' }, { status: 401 })
  }

  const { searchParams } = new URL(request.url)
  const q = searchParams.get('q')?.trim()
  const status = searchParams.get('status')?.trim()
  const category = searchParams.get('category')?.trim()
  const active = searchParams.get('active')?.trim()

  try {
    const entries = await listGlobalKnowledgeEntries(prisma, {
      q,
      status,
      category,
      active: active === 'true' ? true : active === 'false' ? false : undefined,
    })

    return NextResponse.json(entries)
  } catch (error) {
    if (isMissingGlobalKnowledgeTable(error)) {
      return NextResponse.json({ error: 'Globale Wissensbasis ist noch nicht migriert' }, { status: 503 })
    }
    console.error('[knowledge GET]', error)
    return NextResponse.json({ error: 'Wissensbasis konnte nicht geladen werden' }, { status: 500 })
  }
}

export async function POST(request: NextRequest) {
  const session = await auth()
  if (!session?.user) {
    return NextResponse.json({ error: 'Nicht authentifiziert' }, { status: 401 })
  }

  let body: z.infer<typeof KnowledgeCreateSchema>
  try {
    body = KnowledgeCreateSchema.parse(await request.json())
  } catch (error) {
    if (error instanceof z.ZodError) {
      return NextResponse.json({ error: 'Ungueltige Daten', details: error.issues }, { status: 400 })
    }
    return NextResponse.json({ error: 'Ungueltiger Request-Body' }, { status: 400 })
  }

  const admin = isAdmin(session.user.role)
  const status = admin ? body.status ?? 'review' : 'review'
  const kiFreigabe = admin ? body.kiFreigabe === true : false
  const isActive = admin ? body.isActive === true && status === 'approved' && kiFreigabe : false

  try {
    const entry = await createGlobalKnowledgeEntry(prisma, {
      title: body.title.trim(),
      keywords: normalizeKeywords(body.keywords),
      content: body.content.trim(),
      category: body.category?.trim() || null,
      status,
      kiFreigabe,
      isActive,
      createdBy: session.user.name ?? session.user.email ?? null,
      updatedBy: session.user.name ?? session.user.email ?? null,
    })

    return NextResponse.json(entry, { status: 201 })
  } catch (error) {
    if (isMissingGlobalKnowledgeTable(error)) {
      return NextResponse.json({ error: 'Globale Wissensbasis ist noch nicht migriert' }, { status: 503 })
    }
    console.error('[knowledge POST]', error)
    return NextResponse.json({ error: 'Wissenseintrag konnte nicht erstellt werden' }, { status: 500 })
  }
}
