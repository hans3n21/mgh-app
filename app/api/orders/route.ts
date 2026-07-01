import { NextRequest, NextResponse } from 'next/server';
import { prisma } from '@/lib/prisma';
import { z } from 'zod';
import ensureOrderFromMail from '@/lib/mail/ensureOrderFromMail';
import { auth } from '@/lib/auth';

const createOrderSchema = z.object({
  title: z.string().min(1),
  type: z.enum(['GUITAR', 'BODY', 'NECK', 'REPAIR', 'PICKGUARD', 'PICKUPS', 'ENGRAVING', 'FINISH_ONLY']),
  customerId: z.string(),
  assigneeId: z.string().optional(),
});

// Mapping von Frontend-Werten zu Prisma-Enum-Werten (nicht mehr nötig, da direkt Enum-Werte verwendet werden)
function isUniqueConstraintError(error: unknown) {
  return typeof error === 'object' && error !== null && 'code' in error && error.code === 'P2002';
}

export async function GET() {
  try {
    const session = await auth();
    if (!session) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

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
    const session = await auth();
    if (!session) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const body = await request.json();
    const validatedData = createOrderSchema.parse(body);

    const currentYear = new Date().getFullYear();
    let order = null;

    for (let attempt = 0; attempt < 5; attempt += 1) {
      const lastOrder = await prisma.order.findFirst({
        where: { id: { startsWith: `ORD-${currentYear}-` } },
        orderBy: { id: 'desc' },
      });

      const match = lastOrder?.id.match(/ORD-(\d{4})-(\d{3})/);
      const nextNumber = (match ? parseInt(match[2], 10) : 0) + 1 + attempt;
      const orderId = `ORD-${currentYear}-${nextNumber.toString().padStart(3, '0')}`;

      try {
        order = await prisma.order.create({
          data: {
            id: orderId,
            ...validatedData,
          },
          include: {
            customer: true,
            assignee: true,
          },
        });
        break;
      } catch (error) {
        if (!isUniqueConstraintError(error)) throw error;
      }
    }

    if (!order) {
      return NextResponse.json({ error: 'Failed to allocate order ID' }, { status: 409 });
    }

    // WICHTIG: Keine automatische WooCommerce-Bestellung mehr hier.
    // Die Anlage im Shop erfolgt nur noch manuell über
    // POST /api/orders/[id]/woocommerce (Buttons im UI)

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

// Optionaler Helfer: aus Mail heraus neuen Auftrag anlegen und Mail verknüpfen
export async function PUT(request: NextRequest) {
  try {
    const session = await auth();
    if (!session) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const body = await request.json();
    const mailId = body?.mailId as string | undefined;
    if (!mailId) {
      return NextResponse.json({ error: 'mailId required' }, { status: 400 });
    }
    const { order } = await ensureOrderFromMail(mailId);
    return NextResponse.json(order, { status: 201 });
  } catch {
    return NextResponse.json({ error: 'Failed to create order from mail' }, { status: 500 });
  }
}
