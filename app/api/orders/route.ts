import { NextRequest, NextResponse } from 'next/server';
import { prisma } from '@/lib/prisma';
import { z } from 'zod';

const createOrderSchema = z.object({
  title: z.string().min(1),
  type: z.enum(['guitar', 'body', 'pickguard', 'pickup', 'repair', 'laser']),
  customerId: z.string(),
  assigneeId: z.string().optional(),
});

export async function GET() {
  try {
    const orders = await prisma.order.findMany({
      include: {
        customer: true,
        assignee: true,
      },
      orderBy: {
        createdAt: 'desc',
      },
    });

    return NextResponse.json(orders);
  } catch (error) {
    console.error('Error fetching orders:', error);
    return NextResponse.json(
      { error: 'Failed to fetch orders' },
      { status: 500 }
    );
  }
}

export async function POST(request: NextRequest) {
  try {
    const body = await request.json();
    const validatedData = createOrderSchema.parse(body);

    // Generate order ID
    const lastOrder = await prisma.order.findFirst({
      orderBy: { id: 'desc' },
    });

    let orderNumber = 1;
    if (lastOrder) {
      const match = lastOrder.id.match(/ORD-(\d{4})-(\d{3})/);
      if (match) {
        orderNumber = parseInt(match[2]) + 1;
      }
    }

    const currentYear = new Date().getFullYear();
    const orderId = `ORD-${currentYear}-${orderNumber.toString().padStart(3, '0')}`;

    const order = await prisma.order.create({
      data: {
        id: orderId,
        ...validatedData,
      },
      include: {
        customer: true,
        assignee: true,
      },
    });

    return NextResponse.json(order, { status: 201 });
  } catch (error) {
    if (error instanceof z.ZodError) {
      return NextResponse.json(
        { error: 'Invalid data', details: error.issues },
        { status: 400 }
      );
    }

    console.error('Error creating order:', error);
    return NextResponse.json(
      { error: 'Failed to create order' },
      { status: 500 }
    );
  }
}
