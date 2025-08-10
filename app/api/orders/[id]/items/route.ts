import { NextRequest, NextResponse } from 'next/server';
import { prisma } from '@/lib/prisma';
import { z } from 'zod';

const createItemSchema = z.object({
  priceItemId: z.string().nullable().optional(),
  label: z.string(),
  qty: z.number().int().positive(),
  unitPrice: z.number().min(0),
  total: z.number().min(0),
  notes: z.string().optional(),
});

interface RouteParams {
  params: { id: string };
}

export async function GET(request: NextRequest, { params }: RouteParams) {
  try {
    const items = await prisma.orderItem.findMany({
      where: { orderId: params.id },
      include: { priceItem: true },
      orderBy: { id: 'asc' },
    });

    return NextResponse.json(items);
  } catch (error) {
    console.error('Error fetching items:', error);
    return NextResponse.json(
      { error: 'Failed to fetch items' },
      { status: 500 }
    );
  }
}

export async function POST(request: NextRequest, { params }: RouteParams) {
  try {
    const body = await request.json();
    const validatedData = createItemSchema.parse(body);

    const item = await prisma.orderItem.create({
      data: {
        orderId: params.id,
        ...validatedData,
      },
      include: { priceItem: true },
    });

    return NextResponse.json(item);
  } catch (error) {
    if (error instanceof z.ZodError) {
      return NextResponse.json(
        { error: 'Invalid data', details: error.issues },
        { status: 400 }
      );
    }

    console.error('Error creating item:', error);
    return NextResponse.json(
      { error: 'Failed to create item' },
      { status: 500 }
    );
  }
}
