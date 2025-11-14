import { NextRequest, NextResponse } from 'next/server'
import { prisma } from '@/lib/prisma'

// GET /api/orders/[id]/datasheet/latest?type=GUITAR|BODY|NECK|...
export async function GET(
  _req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id: orderId } = await params
  const { searchParams } = new URL(_req.url)
  const type = searchParams.get('type') || undefined

  try {
    const where: any = { orderId }
    if (type) where.type = type

    const ds = await prisma.datasheet.findFirst({
      where,
      orderBy: { version: 'desc' },
      select: { id: true, version: true, updatedAt: true, createdAt: true, type: true },
    })

    if (!ds) return NextResponse.json({ ok: false, notFound: true }, { status: 404 })

    return NextResponse.json({ ok: true, datasheet: ds })
  } catch (error) {
    console.error('latest datasheet error', error)
    return NextResponse.json({ ok: false, error: 'Failed to load latest datasheet' }, { status: 500 })
  }
}


