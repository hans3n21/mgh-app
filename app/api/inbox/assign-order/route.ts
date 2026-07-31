import { NextRequest, NextResponse } from 'next/server';
import { z } from 'zod';
import { prisma } from '@/lib/prisma';
import { assignMailToOrder } from '@/lib/mail/actions';
import { auth } from '@/lib/auth';
import { touchOrderActivity } from '@/lib/order-activity';

const schema = z.object({ messageId: z.string().min(1), orderId: z.string().min(1) });

export async function POST(req: NextRequest) {
  try {
    const session = await auth();
    if (!session?.user) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const body = await req.json();
    const { messageId, orderId } = schema.parse(body);
    const order = await prisma.order.findUnique({
      where: { id: orderId },
      select: { customerId: true, deletedAt: true },
    });
    if (!order || order.deletedAt) {
      return NextResponse.json({ error: 'Order not found' }, { status: 404 });
    }

    await assignMailToOrder(messageId, orderId, order.customerId);
    await touchOrderActivity(orderId);
    return NextResponse.json({ ok: true });
  } catch (error) {
    if (error instanceof z.ZodError) return NextResponse.json({ error: 'Invalid data' }, { status: 400 });
    console.error('assign-order error', error);
    return NextResponse.json({ error: 'Failed to assign' }, { status: 500 });
  }
}


