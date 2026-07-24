import { NextRequest, NextResponse } from 'next/server';
import { prisma } from '@/lib/prisma';
import { auth } from '@/lib/auth';
import { z } from 'zod';
import { normalizePriceItemInput } from '@/lib/prices/categories';

const updatePriceItemSchema = z.object({
  category: z.string().min(1).optional(),
  label: z.string().min(1).optional(),
  description: z.string().nullable().optional(),
  unit: z.string().nullable().optional(),
  price: z.number().int().min(0).nullable().optional(),
  min: z.number().int().min(0).nullable().optional(),
  max: z.number().int().min(0).nullable().optional(),
  priceText: z.string().nullable().optional(),
  mainCategory: z.string().nullable().optional(),
  active: z.boolean().optional(),
});

export async function PATCH(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const session = await auth();
    if (!session?.user) {
      return NextResponse.json(
        { error: 'Unauthorized' },
        { status: 401 }
      );
    }

    const { id } = await params;
    const body = await request.json();
    const validatedData = updatePriceItemSchema.parse(body);

    // Pruefe, ob PriceItem existiert.
    const existingItem = await prisma.priceItem.findUnique({
      where: { id },
    });

    if (!existingItem) {
      return NextResponse.json(
        { error: 'PriceItem not found' },
        { status: 404 }
      );
    }

    const data = normalizePriceItemInput({
      ...existingItem,
      ...validatedData,
    });

    const updatedItem = await prisma.priceItem.update({
      where: { id },
      data: {
        ...validatedData,
        category: data.category,
        label: data.label,
        description: data.description,
        mainCategory: data.mainCategory,
      },
    });

    return NextResponse.json(updatedItem);
  } catch (error) {
    if (error instanceof z.ZodError) {
      return NextResponse.json(
        { error: 'Invalid data', details: error.issues },
        { status: 400 }
      );
    }

    console.error('Error updating price item:', error);
    return NextResponse.json(
      { error: 'Failed to update price item' },
      { status: 500 }
    );
  }
}
