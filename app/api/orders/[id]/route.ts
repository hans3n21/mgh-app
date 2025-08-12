import { NextRequest, NextResponse } from 'next/server';
import { prisma } from '@/lib/prisma';
import { z } from 'zod';

const updateOrderSchema = z.object({
  status: z.enum(['intake', 'quote', 'in_progress', 'finishing', 'setup', 'awaiting_customer', 'complete', 'design_review']).optional(),
  assigneeId: z.string().nullable().optional(),
  title: z.string().optional(),
  finalAmountCents: z.number().int().nonnegative().nullable().optional(),
  paymentStatus: z.enum(['open','deposit','paid']).optional(),
});

interface RouteParams {
  params: { id: string };
}

export async function GET(request: NextRequest, { params }: RouteParams) {
  try {
    const order = await prisma.order.findUnique({
      where: { id: params.id },
      include: {
        customer: true,
        assignee: true,
        specs: true,
        items: { include: { priceItem: true } },
        images: true,
        messages: { include: { sender: true } },
      },
    });

    if (!order) {
      return NextResponse.json(
        { error: 'Order not found' },
        { status: 404 }
      );
    }

    return NextResponse.json(order);
  } catch (error) {
    console.error('Error fetching order:', error);
    return NextResponse.json(
      { error: 'Failed to fetch order' },
      { status: 500 }
    );
  }
}

export async function PATCH(request: NextRequest, { params }: RouteParams) {
  try {
    const body = await request.json();
    const validatedData = updateOrderSchema.parse(body);

    const order = await prisma.order.update({
      where: { id: params.id },
      data: validatedData,
      include: {
        customer: true,
        assignee: true,
        specs: true,
        items: { include: { priceItem: true } },
        images: true,
        messages: { include: { sender: true } },
      },
    });

    return NextResponse.json(order);
  } catch (error) {
    if (error instanceof z.ZodError) {
      return NextResponse.json(
        { error: 'Invalid data', details: error.issues },
        { status: 400 }
      );
    }

    console.error('Error updating order:', error);
    return NextResponse.json(
      { error: 'Failed to update order' },
      { status: 500 }
    );
  }
}
