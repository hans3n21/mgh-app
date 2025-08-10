import { NextRequest, NextResponse } from 'next/server';
import { prisma } from '@/lib/prisma';
import { z } from 'zod';

const updateItemSchema = z.object({
  label: z.string().optional(),
  qty: z.number().int().positive().optional(),
  unitPrice: z.number().min(0).optional(),
  total: z.number().min(0).optional(),
  notes: z.string().optional(),
});

interface RouteParams {
  params: { id: string; itemId: string };
}

export async function PATCH(request: NextRequest, { params }: RouteParams) {
  try {
    const body = await request.json();
    const validatedData = updateItemSchema.parse(body);

    const item = await prisma.orderItem.update({
      where: {
        id: params.itemId,
        orderId: params.id, // Ensure item belongs to this order
      },
      data: validatedData,
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

    console.error('Error updating item:', error);
    return NextResponse.json(
      { error: 'Failed to update item' },
      { status: 500 }
    );
  }
}

export async function DELETE(request: NextRequest, { params }: RouteParams) {
  try {
    await prisma.orderItem.delete({
      where: {
        id: params.itemId,
        orderId: params.id, // Ensure item belongs to this order
      },
    });

    return NextResponse.json({ success: true });
  } catch (error) {
    console.error('Error deleting item:', error);
    return NextResponse.json(
      { error: 'Failed to delete item' },
      { status: 500 }
    );
  }
}
