import { NextRequest, NextResponse } from 'next/server';
import { prisma } from '@/lib/prisma';

export async function GET(request: NextRequest) {
  try {
    const { searchParams } = new URL(request.url);
    const q = searchParams.get('q')?.trim();
    const category = searchParams.get('category')?.trim();

    const where = {
      AND: [
        q
          ? {
              OR: [
                { label: { contains: q, mode: 'insensitive' as const } },
                { category: { contains: q, mode: 'insensitive' as const } },
                { description: { contains: q, mode: 'insensitive' as const } },
                { mainCategory: { contains: q, mode: 'insensitive' as const } },
              ],
            }
          : {},
        category ? { category: { equals: category } } : {},
        { active: { equals: true } },
      ],
    } as const;

    const items = await prisma.priceItem.findMany({
      where,
      orderBy: [
        { category: 'asc' },
        { label: 'asc' },
      ],
    });

    return NextResponse.json(items);
  } catch (error) {
    console.error('Error fetching prices:', error);
    return NextResponse.json({ error: 'Failed to fetch prices' }, { status: 500 });
  }
}


