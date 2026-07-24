import { NextResponse } from 'next/server'
import { getServerSession } from 'next-auth'
import { authOptions } from '@/lib/auth'
import { prisma } from '@/lib/prisma'
import { z } from 'zod'

const EntrySchema = z.object({
  key: z.string().min(1),
  label: z.string().min(1),
  value: z.string().default(''),
  isSecret: z.boolean().default(true),
  category: z.string().nullable().default(null),
  sortOrder: z.number().int().default(0),
})

const BulkUpsertSchema = z.object({
  entries: z.array(EntrySchema),
})

type RouteContext = { params: Promise<{ id: string }> }

export async function GET(
  _req: Request,
  { params }: RouteContext
) {
  const session = await getServerSession(authOptions)
  if (!session?.user) return NextResponse.json({ error: 'Nicht authentifiziert' }, { status: 401 })
  const { id } = await params

  const entries = await prisma.companyData.findMany({
    where: { mailAccountId: id },
    orderBy: { sortOrder: 'asc' },
  })

  return NextResponse.json(entries)
}

export async function PUT(
  req: Request,
  { params }: RouteContext
) {
  const session = await getServerSession(authOptions)
  if (!session?.user) return NextResponse.json({ error: 'Nicht authentifiziert' }, { status: 401 })
  const { id } = await params

  let body: z.infer<typeof BulkUpsertSchema>
  try {
    body = BulkUpsertSchema.parse(await req.json())
  } catch (err) {
    const msg = err instanceof z.ZodError ? err.issues.map((e: z.ZodIssue) => e.message).join(', ') : 'Ungültiger Body'
    return NextResponse.json({ error: msg }, { status: 400 })
  }

  // Bulk-Upsert: alle Einträge auf einmal speichern
  await prisma.$transaction(
    body.entries.map(entry =>
      prisma.companyData.upsert({
        where: { mailAccountId_key: { mailAccountId: id, key: entry.key } },
        create: { mailAccountId: id, ...entry },
        update: {
          label: entry.label,
          value: entry.value,
          isSecret: entry.isSecret,
          category: entry.category,
          sortOrder: entry.sortOrder,
        },
      })
    )
  )

  const updated = await prisma.companyData.findMany({
    where: { mailAccountId: id },
    orderBy: { sortOrder: 'asc' },
  })

  return NextResponse.json(updated)
}

export async function DELETE(
  req: Request,
  { params }: RouteContext
) {
  const session = await getServerSession(authOptions)
  if (!session?.user) return NextResponse.json({ error: 'Nicht authentifiziert' }, { status: 401 })
  const { id } = await params

  let key: string
  try {
    const body = await req.json()
    key = body.key
  } catch {
    return NextResponse.json({ error: 'key fehlt' }, { status: 400 })
  }

  await prisma.companyData.deleteMany({
    where: { mailAccountId: id, key },
  })

  return NextResponse.json({ ok: true })
}
