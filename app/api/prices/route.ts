import { NextRequest, NextResponse } from 'next/server';
import { prisma } from '@/lib/prisma';
import { auth } from '@/lib/auth';
import { z } from 'zod';
import { normalizePriceItemInput } from '@/lib/prices/categories';

const createPriceItemSchema = z.object({
  category: z.string().min(1),
  label: z.string().min(1),
  description: z.string().nullable().optional(),
  unit: z.string().nullable().optional(),
  price: z.number().int().min(0).nullable().optional(),
  min: z.number().int().min(0).nullable().optional(),
  max: z.number().int().min(0).nullable().optional(),
  priceText: z.string().nullable().optional(),
  mainCategory: z.string().nullable().optional(),
  active: z.boolean().default(true),
});

export async function GET(request: NextRequest) {
  try {
    const { searchParams } = new URL(request.url);
    const q = searchParams.get('q')?.trim();
    const category = searchParams.get('category')?.trim();

    const where: any = {
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
      ].filter(condition => Object.keys(condition).length > 0),
    };

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

export async function POST(request: NextRequest) {
  try {
    const session = await auth();
    if (!session?.user) {
      return NextResponse.json(
        { error: 'Unauthorized' },
        { status: 401 }
      );
    }

    const body = await request.json();
    const validatedData = createPriceItemSchema.parse(body);
    const data = normalizePriceItemInput(validatedData);

    const newItem = await prisma.priceItem.create({
      data,
    });

    return NextResponse.json(newItem, { status: 201 });
  } catch (error) {
    if (error instanceof z.ZodError) {
      return NextResponse.json(
        { error: 'Invalid data', details: error.issues },
        { status: 400 }
      );
    }

    console.error('Error creating price item:', error);
    return NextResponse.json(
      { error: 'Failed to create price item' },
      { status: 500 }
    );
  }
}
