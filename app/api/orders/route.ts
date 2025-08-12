import { NextRequest, NextResponse } from 'next/server';
import { prisma } from '@/lib/prisma';
import { z } from 'zod';

const createOrderSchema = z.object({
  title: z.string().min(1),
  type: z.enum(['GUITAR', 'BODY', 'NECK', 'REPAIR', 'PICKGUARD', 'PICKUPS', 'FINISH_ONLY']),
  customerId: z.string(),
  assigneeId: z.string().optional(),
});

// Mapping von Frontend-Werten zu Prisma-Enum-Werten (nicht mehr nötig, da direkt Enum-Werte verwendet werden)
const TYPE_MAPPING: Record<string, string> = {
  'GUITAR': 'GUITAR',
  'BODY': 'BODY',
  'NECK': 'NECK', 
  'REPAIR': 'REPAIR',
  'PICKGUARD': 'PICKGUARD',
  'PICKUPS': 'PICKUPS',
  'FINISH_ONLY': 'FINISH_ONLY',
};

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
    console.log('Creating order with body:', body);
    const validatedData = createOrderSchema.parse(body);
    console.log('Validated data:', validatedData);

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

    console.log('Creating order with ID:', orderId, 'and data:', validatedData);
    
    // Map frontend type to Prisma enum
    const mappedType = TYPE_MAPPING[validatedData.type] || validatedData.type.toUpperCase();
    
    const order = await prisma.order.create({
      data: {
        id: orderId,
        ...validatedData,
        type: mappedType,
      },
      include: {
        customer: true,
        assignee: true,
      },
    });

    console.log('Order created successfully:', order.id);
    // Versuch, WooCommerce-Order anzulegen, ohne die lokale Erstellung zu blockieren
    try {
      const { createWooOrderForInternal } = await import('@/lib/woocommerce');
      const res = await createWooOrderForInternal(order.id);
      await prisma.order.update({
        where: { id: order.id },
        data: { wcOrderId: res.wooOrderId },
      });
    } catch (wooError) {
      console.error('Woo Order create failed:', wooError);
    }

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
